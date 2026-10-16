import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { TRIAGE_PROMPT, DIGITAL_SAFETY_PROMPT, CONTEXT_MEMORY_PROMPT, BRIEFING_PROMPT } from "../src/lib/agents/prompts";
import { triageOutputSchema, digitalSafetyOutputSchema, contextMemoryOutputSchema, briefingOutputSchema } from "../src/lib/agents/schemas";
import { parseRoutingShadowResponse } from "../src/lib/agents/routingContract";
import { parseJevSocialIntent } from "../src/lib/agents/socialIntentContract";
import { reserveSocialIntentRequest } from "./social-intent-budget";
import type { ComparisonBudget } from "./agent-comparison-budget";
import { wholeFlowCases, wholeFlowChecks } from "./whole-flow-shadow-cases";
import { activeFlowCases, activeFlowChecks } from "./whole-flow-active-cases";

const MODEL = "gpt-4o-mini-2024-07-18";
const OPENAI = "https://api.openai.com/v1/chat/completions", ROUTER = "https://openrouter.ai/api/v1/systemone";
const prompts = [TRIAGE_PROMPT, DIGITAL_SAFETY_PROMPT, CONTEXT_MEMORY_PROMPT, BRIEFING_PROMPT];
const schemas = [triageOutputSchema, digitalSafetyOutputSchema, contextMemoryOutputSchema, briefingOutputSchema];
const envNames = ["TRUSTKAKI_LLM_MODEL", "TRUSTKAKI_LLM_BASE_URL", "TRUSTKAKI_LLM_TIMEOUT_MS", "TRUSTKAKI_JEV_ENABLED", "TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED", "TRUSTKAKI_JEV_ROUTING_ENABLED"] as const;
interface Ledger extends ComparisonBudget { protocolHash: string; stopped: boolean; failureCode: string | null; inFlight: number[]; completedFlows: number; finished: boolean; jevModel: string | null }
interface Flow {
  caseId: string; variant: "baseline" | "shadow" | "active"; durationMs: number; costUsd: number; requests: number;
  risk: string; reply: { text: string; agentId?: string }; agents: string[]; memoryCandidateCount: number;
  checks: Record<string, boolean>; shadow: unknown; routing: unknown; jevOnlyInvocations: string[];
  signalTypes: string[]; alertCount: number; hasBriefing: boolean;
}
interface Report { experiment: "shadow" | "active"; protocolHash: string; calls: number; reservedUsd: number; successfulCostUsd: number; manualReview: "pending"; flows: Flow[] }

export function wholeFlowPreflight(experiment: "shadow" | "active" = "shadow") {
  if (!["shadow", "active"].includes(experiment)) throw new Error("whole_flow_unknown_experiment");
  const cases = experiment === "active" ? activeFlowCases : wholeFlowCases;
  const files = ["orchestrator.ts", "runner.ts", "provider.ts", "prompts.ts", "schemas.ts", "policy.ts", "fallbacks.ts",
    "routingContract.ts", "routingShadow.ts", "specialistRouting.ts", "socialDecision.ts", "socialIntentContract.ts"];
  const source = files.map(file => readFileSync(new URL("../src/lib/agents/" + file, import.meta.url), "utf8"));
  source.push(readFileSync(new URL("../src/lib/memory/agentContext.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/lib/memory/retrievalContracts.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/lib/memory/contracts.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../src/lib/patterns/patternWatch.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./whole-flow-shadow-live.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./whole-flow-shadow-cases.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./whole-flow-active-cases.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./agent-comparison-budget.ts", import.meta.url), "utf8"),
    readFileSync(new URL("./social-intent-budget.ts", import.meta.url), "utf8"),
    readFileSync(new URL("../package-lock.json", import.meta.url), "utf8"));
  const protocolHash = createHash("sha256").update(JSON.stringify({ source, cases, experiment, model: MODEL, node: process.version, version: 2 })).digest("hex");
  // Four OpenAI agents and possible social per flow; one routing call per second variant.
  const count = cases.length, maxAttempts = experiment === "active" ? 110 : 66;
  const reservedUsd = (count * 8 * Math.ceil((40000 + 2048) * 0.15 + 1024 * 0.60) + count * 3 * Math.ceil(262144 * 0.042)) / 1_000_000;
  if (reservedUsd > 1 || count * 11 !== maxAttempts) throw new Error("whole_flow_plan_not_bounded");
  return { protocolHash, maxAttempts, reservedUsd };
}

export async function runWholeFlowShadow(options: { directory: string; experiment?: "shadow" | "active"; approvedCapUsd: number; pricesVerified: boolean; request?: typeof fetch }): Promise<Report> {
  const openaiKey = process.env.TRUSTKAKI_LLM_API_KEY?.trim(), routerKey = process.env.OPENROUTER_API_KEY?.trim();
  if (options.approvedCapUsd !== 1 || !options.pricesVerified || !openaiKey || !routerKey) throw new Error("whole_flow_approval_prices_or_keys_missing");
  const experiment = options.experiment ?? "shadow";
  const plan = wholeFlowPreflight(experiment);
  const cases = experiment === "active" ? activeFlowCases : wholeFlowCases;
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(options.directory, "run.lock"), lock = openSync(lockPath, "wx", 0o600);
  const budgetPath = resolve(options.directory, "budget.json"), summaryPath = resolve(options.directory, "summary.json");
  const save = (value: Ledger) => { writeFileSync(budgetPath + ".tmp", JSON.stringify(value), { mode: 0o600 }); renameSync(budgetPath + ".tmp", budgetPath); };
  let ledger: Ledger = { capMicroUsd: 1_000_000, reservedMicroUsd: 0, calls: 0, protocolHash: plan.protocolHash,
    stopped: false, failureCode: null, inFlight: [], completedFlows: 0, finished: false, jevModel: null };
  const originalFetch = globalThis.fetch, transport = options.request ?? originalFetch;
  const environment = Object.fromEntries(envNames.map(name => [name, process.env[name]]));
  const logging = { log: console.log, warn: console.warn, error: console.error };
  const pending = new Set<Promise<Response>>();
  const flows: Flow[] = [];
  let activeCase = "preflight", activeVariant: Flow["variant"] = "baseline", successfulCostUsd = 0;
  let seen = new Set<string>();
  const stop = (code: string) => { ledger.stopped = true; ledger.failureCode ??= code; save(ledger); };
  try {
    if (existsSync(budgetPath)) {
      const old = JSON.parse(readFileSync(budgetPath, "utf8")) as Ledger;
      if (old.protocolHash === plan.protocolHash && old.finished && !old.stopped && old.inFlight.length === 0 && existsSync(summaryPath)) {
        return JSON.parse(readFileSync(summaryPath, "utf8"));
      }
      throw new Error("whole_flow_partial_ledger_requires_review");
    }
    if (existsSync(resolve(options.directory, "flows.jsonl"))) throw new Error("whole_flow_unexpected_artifacts");
    save(ledger);
    process.env.TRUSTKAKI_LLM_MODEL = MODEL; process.env.TRUSTKAKI_LLM_BASE_URL = "https://api.openai.com/v1";
    process.env.TRUSTKAKI_LLM_TIMEOUT_MS = "15000"; process.env.TRUSTKAKI_JEV_ENABLED = "true";
    process.env.TRUSTKAKI_JEV_ROUTING_ENABLED = "false"; // Each experiment pins both routing flags before any request.
    console.log = console.warn = console.error = () => {}; // Do not leak framework/provider prose to the CLI.
    globalThis.fetch = (input, init) => {
      const task = (async () => {
        if (ledger.stopped) throw new Error("whole_flow_stopped");
        let stage = "request_validation", requestId: number | null = null;
        try {
          const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
          if (![OPENAI, ROUTER].includes(url) || init?.method !== "POST" || typeof init.body !== "string") throw new Error();
          if (Buffer.byteLength(init.body, "utf8") > 40000 || ledger.calls >= plan.maxAttempts) throw new Error();
          const body = JSON.parse(init.body);
          const agentIndex = url === OPENAI ? prompts.indexOf(body.messages?.[0]?.content) : -1;
          const kind = url === OPENAI ? "openai_" + agentIndex : body.questions?.social_intent ? "social" : "routing";
          if (url === OPENAI && (agentIndex < 0 || body.messages?.length !== 2 || body.messages[0].role !== "system" || body.messages[1].role !== "user" ||
              body.response_format?.type !== "json_object" || body.max_tokens !== 1024)) throw new Error();
          if (kind === "routing" && activeVariant === "baseline") throw new Error();
          if (seen.has(kind)) throw new Error(); // Includes runAgent's internal retries; no second network attempt.
          seen.add(kind);
          const previous = ledger.reservedMicroUsd;
          ledger = { ...ledger, ...reserveSocialIntentRequest(ledger, url === ROUTER ? "jev" : "openai", body, experiment === "active" ? 110 : 72), inFlight: [...ledger.inFlight, ledger.calls + 1] };
          requestId = ledger.calls; const reservation = ledger.reservedMicroUsd - previous;
          save(ledger);
          stage = "transport";
          const response = await transport(url, { method: "POST", redirect: "error", body: init.body,
            signal: AbortSignal.any([...(init.signal ? [init.signal] : []), AbortSignal.timeout(15000)]),
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + (url === ROUTER ? routerKey : openaiKey) } });
          stage = "http_" + response.status;
          if (!response.ok) { await response.body?.cancel(); throw new Error(); }
          stage = "response_validation";
          const data = await response.json();
          let costUsd: number, model: string, inputTokens: number, outputTokens: number;
          if (url === OPENAI) {
            const value = z.object({ model: z.literal(MODEL), usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().min(0).max(1024) }),
              choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string().min(1) }) })).length(1) }).parse(data);
            schemas[agentIndex].parse(JSON.parse(value.choices[0].message.content));
            model = value.model; costUsd = (value.usage.prompt_tokens * 0.15 + value.usage.completion_tokens * 0.60) / 1_000_000;
            inputTokens = value.usage.prompt_tokens; outputTokens = value.usage.completion_tokens;
          } else {
            const parsed = kind === "social" ? parseJevSocialIntent(data) : parseRoutingShadowResponse(data);
            const usage = z.object({ input_tokens: z.number().int().min(0).max(262144), output_tokens: z.number().int().nonnegative(), cost: z.number().nonnegative() }).parse(data.usage);
            model = parsed.model; costUsd = usage.cost;
            inputTokens = usage.input_tokens; outputTokens = usage.output_tokens;
            if (!/^typesafe\/jev-1\.14(?:[-.]\d+)*$/.test(model) || (ledger.jevModel && ledger.jevModel !== model)) throw new Error();
            ledger.jevModel = model;
          }
          stage = "cost_bound"; if (costUsd * 1_000_000 > reservation) throw new Error();
          successfulCostUsd += costUsd;
          appendFileSync(resolve(options.directory, "requests.jsonl"), JSON.stringify({ requestId, caseId: activeCase, variant: activeVariant, kind, model, inputTokens, outputTokens, costUsd }) + "\n", { mode: 0o600 });
          ledger.inFlight = ledger.inFlight.filter(id => id !== requestId); save(ledger);
          return Response.json(data);
        } catch {
          stop(stage);
          throw new Error("whole_flow_stopped");
        }
      })();
      pending.add(task); void task.then(() => pending.delete(task), () => pending.delete(task));
      return task;
    };
    const { orchestrate } = await import("../src/lib/agents/orchestrator");
    for (const item of cases) for (const variant of ["baseline", experiment] as const) {
      if (ledger.stopped) throw new Error("whole_flow_stopped");
      activeCase = item.id; activeVariant = variant; seen = new Set();
      process.env.TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED = String(variant === "shadow");
      process.env.TRUSTKAKI_JEV_ROUTING_ENABLED = String(variant === "active");
      const start = performance.now(), startCost = successfulCostUsd, startCalls = ledger.calls;
      const result = await orchestrate(item.message, structuredClone(item.context));
      if (ledger.stopped || result.traces.some(trace => trace.fallback)) { stop(ledger.failureCode ?? "application_fallback"); throw new Error("whole_flow_stopped"); }
      const shadow = result.traces.find(trace => trace.agentName === "Jev Routing Shadow");
      const active = result.traces.find(trace => trace.agentName === "Jev Specialist Router");
      if ((variant === "shadow") !== Boolean(shadow) || (variant === "active") !== Boolean(active)) {
        stop("missing_routing_trace"); throw new Error("whole_flow_stopped");
      }
      const routing = active ? JSON.parse(active.output) : null;
      const jevOnlyInvocations: string[] = routing ? routing.executedSpecialists.filter((id: string) => !routing.independentTriggers.includes(id)) : [];
      const flow: Flow = { caseId: item.id, variant, durationMs: performance.now() - start, costUsd: successfulCostUsd - startCost,
        requests: ledger.calls - startCalls, risk: result.riskLevel, reply: result.messages[0], agents: result.traces.map(trace => trace.agentId),
        memoryCandidateCount: result.contextMemoryCandidates.length,
        checks: experiment === "active" ? activeFlowChecks(item.id, result) : wholeFlowChecks(item.id, result),
        shadow: shadow ? JSON.parse(shadow.output) : null, routing, jevOnlyInvocations,
        signalTypes: result.signals.map(signal => signal.type), alertCount: result.alerts.length, hasBriefing: result.briefing !== null };
      flows.push(flow); appendFileSync(resolve(options.directory, "flows.jsonl"), JSON.stringify(flow) + "\n", { mode: 0o600 });
      ledger.completedFlows = flows.length; save(ledger);
    }
    const report: Report = { experiment, protocolHash: plan.protocolHash, calls: ledger.calls, reservedUsd: ledger.reservedMicroUsd / 1_000_000, successfulCostUsd, manualReview: "pending", flows };
    writeFileSync(summaryPath, JSON.stringify(report, null, 2), { mode: 0o600 });
    ledger.finished = true; save(ledger); return report;
  } finally {
    await Promise.allSettled([...pending]); globalThis.fetch = originalFetch;
    Object.assign(console, logging);
    for (const name of envNames) { const value = environment[name]; if (value === undefined) delete process.env[name]; else process.env[name] = value; }
    closeSync(lock); unlinkSync(lockPath);
  }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const experiment = process.argv.includes("--active") ? "active" : "shadow";
  const expected = "--confirm-live --cap-usd=1 --prices-verified" + (experiment === "active" ? " --active" : "");
  if (process.argv.slice(2).join(" ") !== expected) {
    console.error("Requires separate US$1 owner approval and current price verification. No calls made."); process.exitCode = 1;
  } else {
    runWholeFlowShadow({ directory: resolve(process.cwd(), experiment === "active" ? ".jev-active-routing-evaluation" : ".jev-whole-flow-evaluation"),
      experiment, approvedCapUsd: 1, pricesVerified: true })
      .then(report => console.log(JSON.stringify({ experiment: report.experiment, completedFlows: report.flows.length, calls: report.calls, reservedUsd: report.reservedUsd,
        successfulCostUsd: report.successfulCostUsd, manualReview: report.manualReview, failedChecks: report.flows.flatMap(flow => Object.entries(flow.checks).filter(([, passed]) => !passed).map(([check]) => ({ caseId: flow.caseId, variant: flow.variant, check }))) })))
      .catch(() => { console.error("Whole-flow evaluation stopped. Preserve ledger; no automatic retry."); process.exitCode = 1; });
  }
}
