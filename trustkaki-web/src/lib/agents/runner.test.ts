import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("runAgent fallback", () => {
  it("uses safe fallback data without a provider or network call", async () => {
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "");
    const fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    const { runAgent } = await import("./runner");

    const result = await runAgent({
      agentId: "triage",
      agentName: "Triage Agent",
      systemPrompt: "Return JSON",
      userPrompt: "Fictional benchmark input",
      schema: z.object({ safe: z.boolean() }),
      fallback: () => ({ safe: true }),
    });

    expect(result).toMatchObject({
      fallback: true,
      modelUsed: "none",
      data: { safe: true },
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("uses the same safe fallback when a configured provider fails", async () => {
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "synthetic-test-key");
    vi.stubEnv("TRUSTKAKI_LLM_BASE_URL", "https://provider.example.test/v1");
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Synthetic provider failure"));
    const { runAgent } = await import("./runner");

    const result = await runAgent({
      agentId: "triage",
      agentName: "Triage Agent",
      systemPrompt: "Return JSON",
      userPrompt: "Fictional benchmark input",
      schema: z.object({ safe: z.boolean() }),
      fallback: () => ({ safe: true }),
      maxRetries: 0,
    });

    expect(result).toMatchObject({
      fallback: true,
      modelUsed: "none",
      data: { safe: true },
    });
  });
});

describe("runAgent diagnostic boundaries", () => {
  it("keeps upstream payloads out of logs and returned traces", async () => {
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "synthetic-test-key");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("PRIVATE SENIOR CONTENT synthetic-test-key"));
    const { runAgent } = await import("./runner");
    const result = await runAgent({ agentId: "triage", agentName: "Triage", systemPrompt: "JSON", userPrompt: "hello", schema: z.object({ safe: z.boolean() }), fallback: () => ({ safe: true }), maxRetries: 0 });
    expect(result.fallback).toBe(true);
    expect(result.errorMessage).toBe("provider_error");
    expect(JSON.stringify([warning.mock.calls, error.mock.calls, result])).not.toContain("PRIVATE SENIOR CONTENT");
    expect(JSON.stringify([warning.mock.calls, error.mock.calls, result])).not.toContain("synthetic-test-key");
  });

  it("clears its deadline timer after a successful response", async () => {
    vi.useFakeTimers();
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "synthetic-test-key");
    globalThis.fetch = vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"safe":true}' } }] }));
    const { runAgent } = await import("./runner");
    const result = await runAgent({ agentId: "triage", agentName: "Triage", systemPrompt: "JSON", userPrompt: "hello", schema: z.object({ safe: z.boolean() }), fallback: () => ({ safe: false }), maxRetries: 0 });
    expect(result.fallback).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe("runAgent failure cleanup", () => {
  it.each(["invalid", "reject", "timeout"])("returns bounded diagnostics and clears timers on %s", async mode => {
    vi.useFakeTimers();
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "synthetic-test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    globalThis.fetch = mode === "timeout" ? vi.fn(() => new Promise<Response>(() => {})) : mode === "reject" ? vi.fn().mockRejectedValue("arbitrary private exception") : vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: "not JSON PRIVATE CONTENT" } }] }));
    const { runAgent } = await import("./runner");
    const pending = runAgent({ agentId: "triage", agentName: "Triage", systemPrompt: "JSON", userPrompt: "hello", schema: z.object({ safe: z.boolean() }), fallback: () => ({ safe: true }), maxRetries: 0, timeoutMs: 10 });
    if (mode === "timeout") await vi.advanceTimersByTimeAsync(10);
    const result = await pending;
    expect(result.fallback).toBe(true);
    expect(result.errorMessage).toBe(mode === "invalid" ? "invalid_output" : mode === "timeout" ? "timeout" : "provider_error");
    expect(vi.getTimerCount()).toBe(0);
    expect(JSON.stringify(result)).not.toContain("PRIVATE CONTENT");
  });
});


describe("runAgent request cancellation", () => {
  it("aborts the expired request before starting its retry", async () => {
    vi.useFakeTimers();
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "synthetic-test-key");
    const signals: AbortSignal[] = [];
    let firstAbortedBeforeRetry = false;
    globalThis.fetch = vi.fn((_input, init) => {
      const signal = init?.signal as AbortSignal;
      signals.push(signal);
      if (signals.length === 2) {
        firstAbortedBeforeRetry = signals[0].aborted;
        return Promise.resolve(Response.json({ choices: [{ message: { content: '{"safe":true}' } }] }));
      }
      return new Promise<Response>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason), { once: true });
      });
    }) as typeof fetch;
    const { runAgent } = await import("./runner");
    const pending = runAgent({ agentId: "triage", agentName: "Triage", systemPrompt: "JSON", userPrompt: "hello", schema: z.object({ safe: z.boolean() }), fallback: () => ({ safe: false }), maxRetries: 1, timeoutMs: 10 });
    await vi.advanceTimersByTimeAsync(10);
    const result = await pending;
    expect(result.fallback).toBe(false);
    expect(signals).toHaveLength(2);
    expect(firstAbortedBeforeRetry).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
});
