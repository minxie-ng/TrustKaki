import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

function queryChain(result: unknown) {
  const object = {
    insert: vi.fn((value: Record<string, unknown>) => {
      void value;
      return object;
    }),
    select: vi.fn(() => object),
    single: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => object),
    in: vi.fn(() => object),
    order: vi.fn(() => object),
    limit: vi.fn(() => Promise.resolve(result)),
    update: vi.fn((value: Record<string, unknown>) => {
      void value;
      return object;
    }),
  };
  return object;
}

describe("telegramEventRepository", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiServiceClientMock.mockReset();
  });

  it("uses update_id to return an existing event for duplicate delivery", async () => {
    const insertChain = queryChain({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const selectChain = queryChain({
      data: { id: "event-1", update_id: "9001", event_type: "inbound_text" },
      error: null,
    });
    const from = vi
      .fn()
      .mockReturnValueOnce(insertChain)
      .mockReturnValueOnce(selectChain);
    createTrustKakiServiceClientMock.mockReturnValue({ from });
    const { acceptTelegramEvent } = await import("./telegramEventRepository");

    const result = await acceptTelegramEvent({
      updateId: "9001",
      telegramMessageId: "41",
      senderUserId: "user-123",
      chatId: "chat-123",
      occurredAt: "2026-07-15T00:00:00.000Z",
      text: "Not hungry today.",
      payload: { message: { text: "Not hungry today." } },
    });

    expect(result).toMatchObject({ duplicate: true, row: { id: "event-1" } });
    expect(selectChain.eq).toHaveBeenCalledWith("update_id", "9001");
  });

  it("claims an event through the atomic database function", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "event-1", status: "processing", attempt_count: 1 }],
      error: null,
    });
    createTrustKakiServiceClientMock.mockReturnValue({ rpc });
    const { claimTelegramEvent } = await import("./telegramEventRepository");

    const row = await claimTelegramEvent("event-1");

    expect(rpc).toHaveBeenCalledWith("claim_telegram_webhook_event", {
      p_event_id: "event-1",
    });
    expect(row).toMatchObject({ id: "event-1", status: "processing" });
  });

  it("bounds retry scans to 25 oldest received or failed events", async () => {
    const listChain = queryChain({ data: [], error: null });
    const from = vi.fn().mockReturnValue(listChain);
    createTrustKakiServiceClientMock.mockReturnValue({ from });
    const { listRetryableTelegramEvents } = await import(
      "./telegramEventRepository"
    );

    await listRetryableTelegramEvents(500);

    expect(listChain.in).toHaveBeenCalledWith("status", ["received", "failed"]);
    expect(listChain.order).toHaveBeenCalledWith("received_at", {
      ascending: true,
    });
    expect(listChain.limit).toHaveBeenCalledWith(25);
  });

  it("stores resumable orchestration and provider-accepted outbound state", async () => {
    const orchestrationChain = queryChain({ data: null, error: null });
    const outboundChain = queryChain({ data: null, error: null });
    const from = vi
      .fn()
      .mockReturnValueOnce(orchestrationChain)
      .mockReturnValueOnce(outboundChain);
    createTrustKakiServiceClientMock.mockReturnValue({ from });
    const {
      storeTelegramOrchestrationResult,
      updateTelegramOutboundState,
    } = await import("./telegramEventRepository");

    await storeTelegramOrchestrationResult({
      eventId: "event-1",
      context: { senior: {}, messages: [] } as never,
      result: { messages: [], traces: [], policy: {} } as never,
      selectedReplyText: "Please eat something light.",
      selectedReplyAgentId: "triage",
      selectedReplyClientMessageId: "reply-1",
    });
    await updateTelegramOutboundState({
      eventId: "event-1",
      outboundStatus: "accepted",
      outboundMessageId: "51",
    });

    expect(orchestrationChain.update).toHaveBeenCalledWith(
      expect.objectContaining({
        selected_reply_text: "Please eat something light.",
        outbound_status: "pending",
      })
    );
    expect(outboundChain.update).toHaveBeenCalledWith({
      outbound_status: "accepted",
      outbound_message_id: "51",
    });
  });

  it("sanitizes Telegram bot tokens before storing errors", async () => {
    const updateChain = queryChain({ data: null, error: null });
    const from = vi.fn().mockReturnValue(updateChain);
    createTrustKakiServiceClientMock.mockReturnValue({ from });
    const { markTelegramEventFailed } = await import("./telegramEventRepository");

    await markTelegramEventFailed({
      eventId: "event-1",
      error: new Error(
        "request to https://api.telegram.org/bot123456:ABC_secret/sendMessage failed"
      ),
    });

    const update = updateChain.update.mock.calls[0]?.[0];
    expect(update.last_error).not.toContain("123456:ABC_secret");
    expect(update.last_error).toContain("[redacted]");
  });
});
