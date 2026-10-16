import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runWholeFlowShadow, wholeFlowPreflight } from "./whole-flow-shadow-live";
import { DIGITAL_SAFETY_PROMPT, CONTEXT_MEMORY_PROMPT, BRIEFING_PROMPT } from "../src/lib/agents/prompts";

import { activeFlowChecks } from "./whole-flow-active-cases";
import type { OrchestrationResult } from "../src/lib/agents/contracts";

const directories: string[] = [];
const setup = () => {
  const directory = mkdtempSync(join(tmpdir(), "tk-active-flow-")); directories.push(directory);
  return { directory, experiment: "active" as const, approvedCapUsd: 1, pricesVerified: true };
};
beforeEach(() => { vi.resetModules(); vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "fictional-openai"); vi.stubEnv("OPENROUTER_API_KEY", "fictional-router"); });
afterEach(() => { vi.unstubAllEnvs(); directories.splice(0).forEach(d => rmSync(d, { recursive: true, force: true })); });

function response(body: Record<string, unknown>) {
  if (body.questions) {
    const social = "social_intent" in (body.questions as object);
    const labels = social ? ["interested", "declining", "unclear"] : ["present", "absent", "unclear"];
    return { model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
      answers: Object.fromEntries(Object.keys(body.questions as object).map(flag => {
        const choice = social ? "declining" : flag === "digital_safety" ? "present" : "absent";
        return [flag, { type: "choice", choice, confidence: 1, probabilities: Object.fromEntries(labels.map(label => [label, +(label === choice)])) }];
      })) };
  }
  const messages = body.messages as Array<{ content: string }>;
  const data = messages[0].content === DIGITAL_SAFETY_PROMPT
    ? { isScam: false, scamType: null, confidence: 1, warningMessage: "Cannot verify it.", educationalNote: "Check independently." }
    : messages[0].content === CONTEXT_MEMORY_PROMPT ? { candidates: [] }
      : messages[0].content === BRIEFING_PROMPT ? { forCaregiver: "Fictional", forAACVolunteer: "Fictional",
        overallRisk: messages[1].content.match(/"finalRisk":"(green|yellow|red)"/)?.[1] ?? "green", keyConcerns: [], recommendedActions: [] }
        : { signals: [], riskLevel: "green", riskChange: "none", routing: [], summary: "Fictional",
          responseMessage: "You prefer toast. What help do you need?", humanFollowUpRequired: false };
  return { model: "gpt-4o-mini-2024-07-18", usage: { prompt_tokens: 100, completion_tokens: 100 },
    choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }] };
}

describe("active whole-flow preparation (mock transport)", () => {
  it("flags missed specialists, false care signals and unsupported promises", () => {
    const result = { messages: [{ text: "I can cook breakfast for you." }], traces: [],
      signals: [{ type: "health" }], contextMemoryCandidates: [], riskLevel: "green",
      policy: { finalRisk: "green" } } as unknown as OrchestrationResult;
    expect(activeFlowChecks("implicit_scam", result).implicitScamAssessed).toBe(false);
    expect(activeFlowChecks("indirect_preference", result).indirectPreferenceProposed).toBe(false);
    expect(activeFlowChecks("benign_recipe", result).benignRecipeNoCareSignal).toBe(false);
    expect(activeFlowChecks("benign_recipe", result).noObservedMealPromise).toBe(false);
    result.messages[0].text = "Here is a recipe you can cook yourself.";
    result.signals = [];
    expect(activeFlowChecks("benign_recipe", result).benignRecipeNoCareSignal).toBe(true);
    expect(activeFlowChecks("benign_recipe", result).noObservedMealPromise).toBe(true);
  });

  it("preflights ten paired cases with a separate protocol and maximum under US$1", () => {
    const active = wholeFlowPreflight("active"), shadow = wholeFlowPreflight();
    expect(active.maxAttempts).toBe(110); expect(active.reservedUsd).toBeLessThan(1);
    expect(active.protocolHash).not.toBe(shadow.protocolHash); expect(shadow.maxAttempts).toBe(66);
  });

  it("runs 20 actual flows, isolates flags, records Jev-caused invocation and restores state", async () => {
    const options = setup(); vi.stubEnv("TRUSTKAKI_JEV_ROUTING_ENABLED", "previous-active");
    vi.stubEnv("TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED", "true");
    const originalFetch = globalThis.fetch;
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
      expect(ledger.reservedMicroUsd).toBeGreaterThan(0);
      expect(process.env.TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED).toBe("false");
      return Response.json(response(JSON.parse(init!.body as string)));
    });
    const report = await runWholeFlowShadow({ ...options, request });
    expect(report.flows).toHaveLength(20);
    expect(report.flows.filter(f => f.variant === "active")).toHaveLength(10);
    expect(report.flows.some(f => f.jevOnlyInvocations.includes("digital_safety"))).toBe(true);
    expect(report.flows.every(f => f.signalTypes.length === 0)).toBe(true);
    expect(JSON.stringify(report)).not.toMatch(/fictional-openai|fictional-router/);
    expect(process.env.TRUSTKAKI_JEV_ROUTING_ENABLED).toBe("previous-active");
    expect(process.env.TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED).toBe("true"); expect(globalThis.fetch).toBe(originalFetch);
    const calls = request.mock.calls.length;
    await runWholeFlowShadow({ ...options, request }); expect(request).toHaveBeenCalledTimes(calls);
    await expect(runWholeFlowShadow({ ...options, experiment: "shadow", request })).rejects.toThrow();
    expect(request).toHaveBeenCalledTimes(calls);
  });

  it("recovers the exact approved failure once, carries its budget and preserves the original bytes", async () => {
    const options = { ...setup(), recoverFirstValidation: true };
    const source = JSON.stringify({ capMicroUsd: 1000000, reservedMicroUsd: 2224, calls: 1,
      protocolHash: "040a7b768fe62165c3abc31e2b170f3ad362441659646dcce6cc2fe2f5e17d68",
      stopped: true, failureCode: "response_validation", inFlight: [1], completedFlows: 0, finished: false, jevModel: null });
    const request = vi.fn<typeof fetch>(async (_url, init) => Response.json(response(JSON.parse(init!.body as string))));
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow("whole_flow_recovery_source_missing");
    expect(request).not.toHaveBeenCalled();
    writeFileSync(join(options.directory, "budget.json"), source);
    const report = await runWholeFlowShadow({ ...options, request });
    expect(report.flows).toHaveLength(20); expect(report.recoveredFirstValidation).toBe(true);
    expect(report.calls).toBe(request.mock.calls.length + 1);
    expect(report.reservedUsd).toBeGreaterThan(0.002224);
    expect(readFileSync(join(options.directory, "first-failed-budget.json"), "utf8")).toBe(source);
    const count = request.mock.calls.length;
    await runWholeFlowShadow({ ...options, request }); expect(request).toHaveBeenCalledTimes(count);
    expect(wholeFlowPreflight("active", true)).toMatchObject({ maxAttempts: 111, reservedUsd: 0.886314 });
    expect(() => wholeFlowPreflight("shadow", true)).toThrow();
  });

  it("refuses changed failed budgets and refuses another recovery after a new error", async () => {
    const options = { ...setup(), recoverFirstValidation: true };
    const source = { capMicroUsd: 1000000, reservedMicroUsd: 2224, calls: 1,
      protocolHash: "040a7b768fe62165c3abc31e2b170f3ad362441659646dcce6cc2fe2f5e17d68",
      stopped: true, failureCode: "response_validation", inFlight: [1], completedFlows: 0, finished: false, jevModel: null };
    const request = vi.fn<typeof fetch>(async () => new Response(null, { status: 503 }));
    writeFileSync(join(options.directory, "budget.json"), JSON.stringify({ ...source, reservedMicroUsd: 0 }));
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
    writeFileSync(join(options.directory, "budget.json"), JSON.stringify(source));
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
    const ledger = readFileSync(join(options.directory, "budget.json"), "utf8");
    expect(JSON.parse(ledger).calls).toBe(2); expect(JSON.parse(ledger).reservedMicroUsd).toBeGreaterThan(2224);
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(1);
    expect(readFileSync(join(options.directory, "budget.json"), "utf8")).toBe(ledger);
  });

  it.each([false, true])("carries all three attempts after diagnosis and blocks repeat recovery (failure=%s)", async fail => {
    const options = { ...setup(), recoverAfterDiagnostic: true };
    const first = { capMicroUsd: 1000000, reservedMicroUsd: 2224, calls: 1,
      protocolHash: "040a7b768fe62165c3abc31e2b170f3ad362441659646dcce6cc2fe2f5e17d68",
      stopped: true, failureCode: "response_validation", inFlight: [1], completedFlows: 0, finished: false, jevModel: null };
    const second = { ...first, reservedMicroUsd: 4448, calls: 2,
      protocolHash: "4204a626c03fb51c614c6ed311164bd44007e72906dae563dd6e5c56fb3e422d", failureCode: "agent_schema", inFlight: [2] };
    const diagnostic = { capMicroUsd: 1000000, reservedMicroUsd: 6672, calls: 3,
      previousLedgerHash: "4b52328e91abb64400c3b3bf4ed9d9976c2cb78e872708b58eac5091c2ddadc8",
      runtimeBaseCommit: "79c3fd7", caseId: "urgent_scam", status: "agent_schema", schemaValid: false,
      successfulCostUsd: 0.00038114999999999997, issues: [{ code: "invalid_value", path: ["signals", 1, "type"] }] };
    writeFileSync(join(options.directory, "budget.json"), JSON.stringify(second));
    writeFileSync(join(options.directory, "first-failed-budget.json"), JSON.stringify(first));
    writeFileSync(join(options.directory, "triage-diagnostic.json"), "{}");
    const request = vi.fn<typeof fetch>(async (_url, init) => fail ? new Response(null, { status: 503 }) : Response.json(response(JSON.parse(init!.body as string))));
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
    writeFileSync(join(options.directory, "triage-diagnostic.json"), JSON.stringify(diagnostic, null, 2));
    if (fail) await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow();
    else {
      const report = await runWholeFlowShadow({ ...options, request });
      expect(report.flows).toHaveLength(20); expect(report.recoveredAfterDiagnostic).toBe(true);
      expect(report.calls).toBe(request.mock.calls.length + 3);
    }
    expect(readFileSync(join(options.directory, "second-failed-budget.json"), "utf8")).toBe(JSON.stringify(second));
    const count = request.mock.calls.length;
    if (fail) await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow();
    else await runWholeFlowShadow({ ...options, request });
    expect(request).toHaveBeenCalledTimes(count);
    expect(wholeFlowPreflight("active", false, true)).toMatchObject({ maxAttempts: 113, reservedUsd: 0.890762 });
    expect(() => wholeFlowPreflight("active", true, true)).toThrow();
  });

  it("requires separate approval and stops a failed active request without retry or resumption", async () => {
    const options = setup();
    let failedRoutingCalls = 0;
    const request = vi.fn<typeof fetch>(async (_url, init) => {
      const body = JSON.parse(init!.body as string);
      if (body.questions && !("social_intent" in body.questions)) {
        failedRoutingCalls++;
        return new Response(null, { status: 503 });
      }
      return Response.json(response(body));
    });
    await expect(runWholeFlowShadow({ ...options, request, approvedCapUsd: 0 })).rejects.toThrow(); expect(request).not.toHaveBeenCalled();
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow();
    expect(failedRoutingCalls).toBe(1);
    const calls = request.mock.calls.length;
    expect(calls).toBeGreaterThan(1);
    const ledger = JSON.parse(readFileSync(join(options.directory, "budget.json"), "utf8"));
    expect(ledger.stopped).toBe(true); expect(ledger.reservedMicroUsd).toBeGreaterThan(0);
    await expect(runWholeFlowShadow({ ...options, request })).rejects.toThrow(); expect(request).toHaveBeenCalledTimes(calls);
    expect(failedRoutingCalls).toBe(1);
  });
});
