import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMProvider } from "./provider";

const originalFetch = globalThis.fetch;

describe("LLMProvider timeout", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("TRUSTKAKI_LLM_API_KEY", "llm-secret");
    vi.stubEnv("TRUSTKAKI_LLM_BASE_URL", "https://llm.example.test/v1");
    vi.stubEnv("TRUSTKAKI_LLM_TIMEOUT_MS", "20");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllEnvs();
  });

  it("maps the runtime TimeoutError from AbortSignal.timeout", async () => {
    let observedErrorName: string | undefined;
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            const reason = init.signal?.reason;
            observedErrorName =
              reason instanceof DOMException ? reason.name : undefined;
            reject(reason);
          });
        })
    ) as typeof fetch;

    const provider = new LLMProvider();

    await expect(
      provider.chat({
        systemPrompt: "Return JSON",
        userPrompt: "Hello",
      })
    ).rejects.toThrow("LLM request timed out");
    expect(observedErrorName).toBe("TimeoutError");
  });
});
