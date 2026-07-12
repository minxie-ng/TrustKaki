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

  it("aborts calls after the configured bounded timeout", async () => {
    globalThis.fetch = vi.fn(
      (_input: RequestInfo | URL, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The operation was aborted.", "AbortError"));
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
  });
});
