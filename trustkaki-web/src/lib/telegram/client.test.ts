import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Telegram outbound client", () => {
  it("sanitizes bot tokens and provider identifiers from log messages", async () => {
    const { sanitizeTelegramError } = await import("./logging");
    const sanitized = sanitizeTelegramError(
      new Error(
        "request to bot123456:secret-token failed for chat 8123456789"
      )
    );

    expect(sanitized).not.toContain("123456:secret-token");
    expect(sanitized).not.toContain("8123456789");
    expect(sanitized).toContain("[redacted]");
    expect(sanitized).toContain("[id-redacted]");
  });

  it("builds the exact sendMessage request", async () => {
    const { buildTelegramTextRequest } = await import("./client");
    const request = buildTelegramTextRequest(
      { botToken: "123456:secret-token", timeoutMs: 8_000 },
      { chatId: "8123456789", text: "Please eat something light first." }
    );

    expect(request.url).toBe(
      "https://api.telegram.org/bot123456:secret-token/sendMessage"
    );
    expect(request.body).toEqual({
      chat_id: "8123456789",
      text: "Please eat something light first.",
    });
    expect(request.init).toMatchObject({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: "8123456789",
        text: "Please eat something light first.",
      }),
    });
    expect(request.init.signal).toBeInstanceOf(AbortSignal);
  });

  it("validates a successful response and extracts the provider message ID", async () => {
    const { sendTelegramTextWithConfig } = await import("./client");
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          result: {
            message_id: 74,
            date: 1784102401,
            chat: { id: 8123456789, type: "private" },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    await expect(
      sendTelegramTextWithConfig(
        { botToken: "123456:secret-token", timeoutMs: 8_000 },
        { chatId: "8123456789", text: "Okay, please let Rachel know." },
        fetchImpl
      )
    ).resolves.toEqual({ messageId: "74" });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it.each([
    [
      "HTTP error",
      vi.fn().mockResolvedValue(new Response("unauthorized", { status: 401 })),
      "Telegram send failed with HTTP 401",
    ],
    [
      "invalid response",
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 })
      ),
      "Telegram send response was invalid",
    ],
    [
      "provider rejection",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ ok: false, description: "bot123456:secret-token rejected" }),
          { status: 200 }
        )
      ),
      "Telegram send response was invalid",
    ],
    [
      "timeout",
      vi.fn().mockRejectedValue(
        Object.assign(new Error("bot123456:secret-token timed out"), {
          name: "TimeoutError",
        })
      ),
      "Telegram send timed out",
    ],
    [
      "network error",
      vi.fn().mockRejectedValue(
        new Error("request to bot123456:secret-token failed")
      ),
      "Telegram send failed",
    ],
  ])("handles %s without exposing the token", async (_name, fetchImpl, message) => {
    const { sendTelegramTextWithConfig } = await import("./client");
    const error = await sendTelegramTextWithConfig(
      { botToken: "123456:secret-token", timeoutMs: 8_000 },
      { chatId: "8123456789", text: "Test" },
      fetchImpl
    ).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toBe(message);
    expect((error as Error).message).not.toContain("123456:secret-token");
  });
});
