import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWholeFlowShadow, wholeFlowPreflight } from "./whole-flow-shadow-live";
import { DIGITAL_SAFETY_PROMPT, CONTEXT_MEMORY_PROMPT, BRIEFING_PROMPT } from "../src/lib/agents/prompts";

const directories: string[] = [];
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "tk-whole-flow-")); directories.push(directory);
  return { directory, approvedCapUsd: 1, pricesVerified: true };
};
beforeEach(() => { vi.resetModules(); vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "fictional-openai"); vi.stubEnv("OPENROUTER_API_KEY", "fictional-router"); });
afterEach(() => { vi.unstubAllEnvs(); directories.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

function providerResponse(body: Record<string, unknown>) {
  if (body.questions) {
    const social = "social_intent" in (body.questions as object);
    const labels = social ? ["interested", "declining", "unclear"] : ["present", "absent", "unclear"];
    return { model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
      answers: Object.fromEntries(Object.keys(body.questions as object).map(flag => [flag, { type: "choice", choice: social ? "declining" : "absent", confidence: 1,
        probabilities: Object.fromEntries(labels.map(label => [label, +(label === (social ? "declining" : "absent"))])) }])) };
  }
  const messages = body.messages as Array<{ content: string }>;
  const content = messages[0].content === DIGITAL_SAFETY_PROMPT ? { isScam: false, scamType: null, confidence: 1, warningMessage: "Fictional warning", educationalNote: "Fictional note" }
    : messages[0].content === CONTEXT_MEMORY_PROMPT ? { candidates: [] }
    : messages[0].content === BRIEFING_PROMPT ? { forCaregiver: "Fictional note", forAACVolunteer: "Fictional note",
      overallRisk: messages[1].content.match(/"finalRisk":"(green|yellow|red)"/)?.[1] ?? "green", keyConcerns: [], recommendedActions: [] }
    : { signals: [], riskLevel: "green", riskChange: "none", routing: [], summary: "Fictional summary",
      responseMessage: "Your preference is toast. What issue do you mean?", humanFollowUpRequired: false };
  return { model: "gpt-4o-mini-2024-07-18", usage: { prompt_tokens: 100, completion_tokens: 100 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] };
}

describe("whole-flow shadow harness (mock transport only)", () => {
  it("preflights the full 66-attempt maximum below US$1 without requests", () => {
    const plan = wholeFlowPreflight(); expect(plan.maxAttempts).toBe(66); expect(plan.reservedUsd).toBeLessThan(1);
    expect(plan.protocolHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it("refuses missing approval, prices or key before transport", async () => {
    const options = setup(), request = vi.fn<typeof fetch>();
    await expect(runWholeFlowShadow({ ...options, request, approvedCapUsd: 0 })).rejects.toThrow();
    await expect(runWholeFlowShadow({ ...options, request, pricesVerified: false })).rejects.toThrow();
    vi.stubEnv("OPENROUTER_API_KEY", "");
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("executes actual orchestration, reserves before requests and restores process state", async () => {
    const options = setup(), originalFetch = globalThis.fetch, originalLog = console.log;
    vi.stubEnv("TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED", "previous-value");
    vi.stubEnv("TRUSTKAKI_JEV_ROUTING_ENABLED", "true");
    let calls = 0;
    const request = vi.fn<typeof fetch>(async (url, init) => {
      calls++;
      const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
      expect(ledger.calls).toBe(calls); expect(ledger.inFlight.length).toBeGreaterThan(0);
      expect(ledger.reservedMicroUsd).toBeLessThanOrEqual(1_000_000);
      const router = url === "https://openrouter.ai/api/v1/systemone";
      expect(router || url === "https://api.openai.com/v1/chat/completions").toBe(true);
      expect(init?.headers).toMatchObject({ Authorization: "Bearer " + (router ? "fictional-router" : "fictional-openai") });
      expect(init?.redirect).toBe("error");
      return Response.json(providerResponse(JSON.parse(init!.body as string)));
    });
    const report = await runWholeFlowShadow({ ...options, request });
    expect(report.flows).toHaveLength(12);
    expect(report.manualReview).toBe("pending");
    const requestRow = JSON.parse(readFileSync(join(options.directory, "requests.jsonl"), "utf8").split("\n")[0]);
    expect(requestRow).toMatchObject({ inputTokens: 100, outputTokens: 100 });
    expect(report.flows.filter(r => r.variant === "shadow").every(r => r.shadow !== null)).toBe(true);
    expect(globalThis.fetch).toBe(originalFetch); expect(console.log).toBe(originalLog);
    expect(process.env.TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED).toBe("previous-value");
    expect(process.env.TRUSTKAKI_JEV_ROUTING_ENABLED).toBe("true");
    expect(JSON.stringify(report)).not.toMatch(/fictional-openai|fictional-router/);
    const count = calls;
    await runWholeFlowShadow({ ...options, request });
    expect(calls).toBe(count);
  });

  it("stops on failure, blocks the application's internal retries and refuses partial resumption", async () => {
    const options = setup();
    const request = vi.fn<typeof fetch>(async () => new Response("private provider details", { status: 503 }));
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow("whole_flow_stopped");
    expect(request).toHaveBeenCalledTimes(1);
    const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
    expect(ledger.stopped).toBe(true); expect(ledger.reservedMicroUsd).toBeGreaterThan(0);
    expect(JSON.stringify(ledger)).not.toContain("private provider");
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it.each(["model", "schema", "cost", "usage", "endpoint"])("stops on %s violations without a second network request", async reason => {
    const options = setup();
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      if (reason === "endpoint") return globalThis.fetch("https://unexpected.example", { method: "POST", body: "{}" });
      const data = providerResponse(JSON.parse(init!.body as string));
      if (reason === "model") data.model = "unverified";
      if ("choices" in data) {
        if (reason === "schema") data.choices![0].message.content = "{}";
        if (reason === "cost") data.usage.prompt_tokens = 100000000;
        if (reason === "usage") data.usage.completion_tokens = -1;
      }
      return Response.json(data);
    });
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow("whole_flow_stopped");
    expect(request).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8")).stopped).toBe(true);
  });

  it("retains a failed parallel request reservation when its companion succeeds", async () => {
    const options = setup();
    let release: (() => void) | undefined;
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      if (body.questions && !body.questions.social_intent) return new Promise<Response>(resolve => {
        release = () => resolve(Response.json(providerResponse(body)));
      });
      if (release) { release(); return new Response(null, { status: 503 }); }
      return Response.json(providerResponse(body));
    });
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow("whole_flow_stopped");
    const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
    expect(ledger.stopped).toBe(true); expect(ledger.failureCode).toBe("http_503");
    expect(ledger.inFlight).toHaveLength(1);
    const rows = readFileSync(join(options.directory, "requests.jsonl"), "utf8").trim().split("\n").map(line => JSON.parse(line));
    expect(rows.some(row => row.kind === "routing")).toBe(true);
    expect(ledger.calls).toBe(rows.length + 1);
  });

  it("rejects concurrent use of its directory without resetting the first run", async () => {
    const options = setup();
    let enter!: () => void, release!: () => void;
    const entered = new Promise<void>(resolve => { enter = resolve; });
    const request = vi.fn<typeof fetch>(() => new Promise<Response>(resolve => { release = () => resolve(new Response(null, { status: 503 })); enter(); }));
    const first = runWholeFlowShadow({ ...options, request });
    const rejected = expect(first).rejects.toThrow("whole_flow_stopped");
    await entered;
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(1);
    release(); await rejected;
    expect(existsSync(join(options.directory, "run.lock"))).toBe(false);
    expect(JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8")).calls).toBe(1);
  });
});
