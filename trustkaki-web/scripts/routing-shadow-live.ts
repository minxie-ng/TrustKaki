import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { TRIAGE_PROMPT, triageUserPrompt } from "../src/lib/agents/prompts";
import { buildRoutingShadowRequest, parseRoutingShadowResponse, routingShadowHash, summarizeRoutingShadow,
  triageRoutingJudgment, type RoutingJudgment, type RoutingShadowCase } from "../src/lib/agents/evaluation/routingShadow";
import { routingShadowCases } from "../src/lib/agents/evaluation/routingShadowCases";
import { reserveSocialIntentRequest } from "./social-intent-budget";
import type { ComparisonBudget } from "./agent-comparison-budget";

type Provider = "jev" | "triage";
interface Ledger extends ComparisonBudget { protocolHash: string; inFlight: string | null; stopped: boolean; jevModel: string | null; approvedDnsRetry?: boolean; approvedRemainingRetry?: boolean; failedAttempts?: number }
interface Observation { provider: Provider; caseId: string; model: string; judgment: RoutingJudgment; durationMs: number; costUsd: number;
  decisions?: ReturnType<typeof parseRoutingShadowResponse>["answers"] }
const MODEL = "gpt-4o-mini-2024-07-18";
const openaiSchema = z.object({ model: z.literal(MODEL),
  choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string() }) })).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().min(0).max(1024) }),
});
export function routingTriageRequest(item: RoutingShadowCase) {
  return { model: MODEL, temperature: 0.5, max_tokens: 1024, response_format: { type: "json_object" }, messages: [
    { role: "system", content: TRIAGE_PROMPT }, { role: "user", content: triageUserPrompt(item.message, item.context) },
  ] };
}

export async function runRoutingShadow(options: {
  directory: string; approvedCapUsd: number; pricesVerified: boolean; openrouterKey: string; openaiKey: string; request?: typeof fetch; approvedDnsRetry?: boolean; approvedRemainingRetry?: boolean;
}) {
  if (options.approvedCapUsd !== 1 || !options.pricesVerified || !options.openrouterKey.trim() || !options.openaiKey.trim()) {
    throw new Error("routing_shadow_approval_prices_or_keys_missing");
  }
  const request = options.request ?? fetch;
  const protocolHash = createHash("sha256").update(JSON.stringify({ dataset: routingShadowHash(routingShadowCases),
    triageRequests: routingShadowCases.map(routingTriageRequest), protocolVersion: 1 })).digest("hex");
  const bodies = routingShadowCases.map(item => ({ jev: buildRoutingShadowRequest(item.message, item.context), triage: routingTriageRequest(item) }));
  // Preflight the complete plan against the same bounded, confirmed prices before spending.
  let planned: ComparisonBudget = { capMicroUsd: 1_000_000, reservedMicroUsd: 0, calls: 0 };
  for (const pair of bodies) for (const provider of ["jev", "triage"] as const) {
    planned = reserveSocialIntentRequest(planned, provider === "jev" ? "jev" : "openai", pair[provider]);
  }
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(options.directory, "run.lock"), lock = openSync(lockPath, "wx", 0o600);
  const ledgerPath = resolve(options.directory, "budget.json"), resultsPath = resolve(options.directory, "observations.jsonl");
  const save = (ledger: Ledger) => {
    writeFileSync(ledgerPath + ".tmp", JSON.stringify(ledger), { mode: 0o600 });
    renameSync(ledgerPath + ".tmp", ledgerPath);
  };
  try {
    let ledger: Ledger = existsSync(ledgerPath) ? JSON.parse(readFileSync(ledgerPath, "utf8")) : {
      capMicroUsd: 1_000_000, reservedMicroUsd: 0, calls: 0, protocolHash, inFlight: null, stopped: false, jevModel: null,
    };
    const rows: Observation[] = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map(s => JSON.parse(s)) : [];
    const keys = new Set(rows.map(r => r.provider + ":" + r.caseId));
    // One owner-approved recovery of the documented initial DNS failure. Never
    // clear subsequent stops or refund the failed attempt's reservation.
    if (options.approvedDnsRetry && !ledger.approvedDnsRetry) {
      if (ledger.protocolHash !== protocolHash || ledger.capMicroUsd !== 1_000_000 || ledger.calls !== 1 ||
          ledger.reservedMicroUsd !== 11011 || !ledger.stopped || ledger.inFlight !== "jev:routing_01_1" ||
          rows.length !== 0 || ledger.jevModel !== null) throw new Error("routing_shadow_retry_state_mismatch");
      writeFileSync(resolve(options.directory, "initial-dns-failure.json"), JSON.stringify(ledger), { mode: 0o600, flag: "wx" });
      ledger = { ...ledger, stopped: false, inFlight: null, approvedDnsRetry: true, failedAttempts: 1 };
      save(ledger);
    }
    if (options.approvedRemainingRetry && !ledger.approvedRemainingRetry) {
      const expectedKeys = routingShadowCases.slice(0, 30).flatMap(c => ["jev:" + c.id, "triage:" + c.id]);
      if (ledger.protocolHash !== protocolHash || ledger.capMicroUsd !== 1_000_000 || ledger.calls !== 62 ||
          ledger.reservedMicroUsd !== 415967 || !ledger.stopped || ledger.inFlight !== "jev:routing_11_1" ||
          !ledger.approvedDnsRetry || ledger.failedAttempts !== 1 || rows.length !== 60 || keys.size !== 60 ||
          !expectedKeys.every(key => keys.has(key)) || ledger.jevModel !== "typesafe/jev-1.14-20261014") {
        throw new Error("routing_shadow_remaining_retry_state_mismatch");
      }
      writeFileSync(resolve(options.directory, "second-failure.json"), JSON.stringify(ledger), { mode: 0o600, flag: "wx" });
      ledger = { ...ledger, stopped: false, inFlight: null, approvedRemainingRetry: true, failedAttempts: 2 };
      save(ledger);
    }
    const failedAttempts = ledger.approvedRemainingRetry ? 2 : ledger.approvedDnsRetry ? 1 : 0;
    if (ledger.capMicroUsd !== 1_000_000 || ledger.protocolHash !== protocolHash || ledger.stopped || ledger.inFlight !== null ||
        ledger.calls !== rows.length + failedAttempts ||
        ((ledger.failedAttempts ?? 0) !== failedAttempts) || keys.size !== rows.length || rows.some(r =>
          !["jev", "triage"].includes(r.provider) || !routingShadowCases.some(c => c.id === r.caseId))) {
      throw new Error("routing_shadow_ledger_requires_review");
    }
    for (const [index, item] of routingShadowCases.entries()) for (const provider of ["jev", "triage"] as const) {
      const key = provider + ":" + item.id;
      if (keys.has(key)) continue;
      const body = bodies[index][provider], previous = ledger.reservedMicroUsd;
      ledger = { ...ledger, ...reserveSocialIntentRequest(ledger, provider === "jev" ? "jev" : "openai", body, ledger.approvedRemainingRetry ? 74 : ledger.approvedDnsRetry ? 73 : 72), inFlight: key };
      save(ledger); // Failures keep their full reservation; never retry or reset.
      const start = performance.now();
      let failureStage = "transport";
      let httpStatus: number | null = null;
      try {
        const response = await request(provider === "jev" ? "https://openrouter.ai/api/v1/systemone" : "https://api.openai.com/v1/chat/completions", {
          method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
          headers: { "Content-Type": "application/json", Authorization: "Bearer " + (provider === "jev" ? options.openrouterKey : options.openaiKey) },
          body: JSON.stringify(body),
        });
        failureStage = "http"; httpStatus = response.status;
        if (!response.ok) { await response.body?.cancel(); throw new Error("provider_http_error"); }
        failureStage = "response_json";
        const value: unknown = await response.json();
        failureStage = "validation";
        let model: string, judgment: RoutingJudgment, costUsd: number;
        let decisions: Observation["decisions"];
        if (provider === "jev") {
          const parsed = parseRoutingShadowResponse(value);
          if (parsed.usage.input_tokens > 262144 || (ledger.jevModel && ledger.jevModel !== parsed.model)) throw new Error("provider_model_or_usage_changed");
          ledger.jevModel = parsed.model; model = parsed.model; judgment = parsed.judgment; costUsd = parsed.usage.cost; decisions = parsed.answers;
        } else {
          const parsed = openaiSchema.parse(value); model = parsed.model;
          judgment = triageRoutingJudgment({ data: JSON.parse(parsed.choices[0].message.content), fallback: false });
          costUsd = (parsed.usage.prompt_tokens * 0.15 + parsed.usage.completion_tokens * 0.60) / 1_000_000;
        }
        failureStage = "cost_bound";
        if (costUsd * 1_000_000 > ledger.reservedMicroUsd - previous) throw new Error("cost_exceeds_reservation");
        failureStage = "persist_observation";
        const observation = { provider, caseId: item.id, model, judgment, costUsd, decisions, durationMs: performance.now() - start };
        appendFileSync(resultsPath, JSON.stringify(observation) + "\n", { mode: 0o600 }); rows.push(observation);
        ledger.inFlight = null; save(ledger);
      } catch (error) {
        ledger.stopped = true; save(ledger);
        const errorKind = error instanceof Error && ["AbortError", "TimeoutError", "TypeError", "SyntaxError", "ZodError"].includes(error.name) ? error.name : "Error";
        // Safe diagnostics only: never persist provider bodies, headers, keys or
        // arbitrary exception messages. This does not retry the failed request.
        writeFileSync(resolve(options.directory, "last-failure.json"), JSON.stringify({ key, stage: failureStage, httpStatus, errorKind }), { mode: 0o600 });
        throw new Error("routing_shadow_stopped_at_" + key);
      }
    }
    const summaries = Object.fromEntries((["jev", "triage"] as const).map(provider => {
      const observations = routingShadowCases.map(c => rows.find(r => r.provider === provider && r.caseId === c.id)!);
      const durations = observations.map(r => r.durationMs).sort((a, b) => a - b);
      return [provider, { ...summarizeRoutingShadow(routingShadowCases, observations.map(r => r.judgment)),
        costUsd: observations.reduce((sum, r) => sum + r.costUsd, 0), p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] }];
    }));
    const report = { protocolHash, datasetHash: routingShadowHash(routingShadowCases), calls: ledger.calls,
      reservedUsd: ledger.reservedMicroUsd / 1_000_000, plannedReservationUsd: planned.reservedMicroUsd / 1_000_000, summaries };
    writeFileSync(resolve(options.directory, "summary.json"), JSON.stringify(report, null, 2), { mode: 0o600 });
    return report;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2).join(" ");
  if (!["--confirm-live --cap-usd=1 --prices-verified", "--confirm-live --cap-usd=1 --prices-verified --approved-dns-retry", "--confirm-live --cap-usd=1 --prices-verified --approved-remaining-retry"].includes(args)) {
    console.error("Requires separate owner spending approval and verified current prices; no calls made."); process.exitCode = 1;
  } else {
    runRoutingShadow({ directory: resolve(process.cwd(), ".jev-routing-evaluation"), approvedCapUsd: 1, pricesVerified: true,
      openrouterKey: process.env.OPENROUTER_API_KEY ?? "", openaiKey: process.env.TRUSTKAKI_LLM_API_KEY ?? "", approvedDnsRetry: args.endsWith(" --approved-dns-retry"), approvedRemainingRetry: args.endsWith(" --approved-remaining-retry") })
      .then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(() => { console.error("Routing comparison stopped; preserve ledger for review. No automatic retry."); process.exitCode = 1; });
  }
}
