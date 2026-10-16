import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runJevRoutingShadow, routingShadowTrace } from "./routingShadow";
import { fictionalRoutingContext } from "./evaluation/routingShadow";
import { routingFlags } from "./routingContract";

const response = () => ({ model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
  answers: Object.fromEntries(routingFlags.map(flag => [flag, { type: "choice", choice: "present", confidence: 1,
    probabilities: { present: 1, absent: 0, unclear: 0 } }])) });
const baseline = (fallback = false) => ({ fallback, data: { signals: [], routing: [], riskLevel: "green", riskChange: "none",
  summary: "private baseline prose", responseMessage: "private reply", humanFollowUpRequired: false } });
beforeEach(() => { vi.stubEnv("TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED", "true"); vi.stubEnv("OPENROUTER_API_KEY", "fictional-key"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });

describe("Jev routing shadow observer", () => {
  it("does nothing when disabled, independently of the social flag", async () => {
    vi.stubEnv("TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED", "false"); vi.stubEnv("TRUSTKAKI_JEV_ENABLED", "true");
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    expect(await runJevRoutingShadow("hello", fictionalRoutingContext())).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(["missing_key", "long_message", "long_context"])("skips %s before sending", async reason => {
    const context = fictionalRoutingContext();
    if (reason === "missing_key") vi.stubEnv("OPENROUTER_API_KEY", "");
    if (reason === "long_context") context.senior.name = "x".repeat(12001);
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    const observation = await runJevRoutingShadow(reason === "long_message" ? "x".repeat(1001) : "hello", context);
    expect(observation?.judgment).toBeNull(); expect(observation?.modelUsed).toBe("none");
    expect(request).not.toHaveBeenCalled();
  });

  it("records six decisions and differences without recording private context or changing state", async () => {
    const request = vi.fn().mockResolvedValue(Response.json(response())); vi.stubGlobal("fetch", request);
    const context = fictionalRoutingContext(); context.senior.name = "Private Fictional Name";
    const observation = await runJevRoutingShadow("private current message", context);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/systemone"); expect(options.redirect).toBe("error");
    expect(JSON.parse(options.body).state.context).toEqual(context);
    const trace = routingShadowTrace(observation!, baseline());
    const output = JSON.parse(trace.output);
    expect(output.disagreements).toEqual([...routingFlags]);
    expect(output.jevJudgment).toEqual(Object.fromEntries(routingFlags.map(flag => [flag, "present"])));
    expect(trace).toMatchObject({ agentId: "orchestrator", agentName: "Jev Routing Shadow", fallback: false,
      modelUsed: "typesafe/jev-1.14-20261014", stateChanges: [] });
    expect(trace.outputSummary).toContain("Shadow only");
    for (const text of ["private current message", "Private Fictional Name", "private baseline prose", "fictional-key"]) {
      expect(JSON.stringify(trace)).not.toContain(text);
    }
  });

  it("does not turn Triage fallback into all-negative baseline evidence", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(response())));
    const observation = await runJevRoutingShadow("hello", fictionalRoutingContext());
    for (const triage of [baseline(true), { fallback: false, data: {} }]) {
      const output = JSON.parse(routingShadowTrace(observation!, triage).output);
      expect(output.triageJudgment).toBeNull(); expect(output.disagreements).toBeNull();
    }
  });

  it.each(["http", "transport", "model", "malformed"])("contains %s errors with one request and no raw error leakage", async reason => {
    const body = response(); if (reason === "model") body.model = "unverified-model";
    const request = vi.fn();
    if (reason === "transport") request.mockRejectedValue(new Error("private provider error fictional-key"));
    else request.mockResolvedValue(reason === "http" ? new Response("private provider error", { status: 503 }) : Response.json(reason === "malformed" ? {} : body));
    vi.stubGlobal("fetch", request);
    const observation = await runJevRoutingShadow("private current message", fictionalRoutingContext());
    expect(request).toHaveBeenCalledTimes(1);
    const trace = routingShadowTrace(observation!, baseline());
    expect(trace.fallback).toBe(true); expect(trace.modelUsed).toBe("none");
    expect(JSON.parse(trace.output).jevJudgment).toBeNull();
    expect(JSON.stringify(trace)).not.toMatch(/private provider|private current|fictional-key/);
  });

  it("aborts after three seconds without retry", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockImplementation(ms => {
      const controller = new AbortController(); setTimeout(() => controller.abort(), ms); return controller.signal;
    });
    const request = vi.fn((_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener("abort", () => reject(new DOMException("timeout", "TimeoutError")));
    }));
    vi.stubGlobal("fetch", request);
    const pending = runJevRoutingShadow("hello", fictionalRoutingContext());
    await vi.advanceTimersByTimeAsync(3000);
    expect((await pending)?.judgment).toBeNull(); expect(timeout).toHaveBeenCalledWith(3000);
    expect(request).toHaveBeenCalledTimes(1);
  });
});
