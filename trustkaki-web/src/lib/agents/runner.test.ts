import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.unstubAllEnvs();
  vi.resetModules();
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
