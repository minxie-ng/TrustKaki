import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

function chain(result: unknown) {
  const object = {
    insert: vi.fn(() => object),
    select: vi.fn(() => object),
    single: vi.fn(() => Promise.resolve(result)),
    eq: vi.fn(() => object),
    in: vi.fn(() => object),
    order: vi.fn(() => object),
    limit: vi.fn(() => Promise.resolve(result)),
  };
  return object;
}

describe("whatsappEventRepository", () => {
  beforeEach(() => {
    createTrustKakiServiceClientMock.mockReset();
  });

  it("uses the atomic claim RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ id: "event_1" }],
      error: null,
    });
    createTrustKakiServiceClientMock.mockReturnValue({ rpc });
    const { claimWhatsAppEvent } = await import("./whatsappEventRepository");

    const row = await claimWhatsAppEvent("event_1");

    expect(rpc).toHaveBeenCalledWith("claim_whatsapp_webhook_event", {
      p_event_id: "event_1",
    });
    expect(row).toEqual({ id: "event_1" });
  });

  it("treats duplicate inserts as accepted existing events", async () => {
    const insertChain = chain({
      data: null,
      error: { code: "23505", message: "duplicate key" },
    });
    const selectChain = chain({
      data: {
        id: "event_1",
        whatsapp_message_id: "wamid.inbound",
        event_type: "inbound_text",
      },
      error: null,
    });
    const from = vi.fn((table: string) =>
      table === "whatsapp_webhook_events" && from.mock.calls.length === 1
        ? insertChain
        : selectChain
    );
    createTrustKakiServiceClientMock.mockReturnValue({ from });
    const { acceptWhatsAppEvent } = await import("./whatsappEventRepository");

    const result = await acceptWhatsAppEvent({
      eventType: "inbound_text",
      whatsappMessageId: "wamid.inbound",
      phoneNumberId: "phone_123",
      senderPhoneE164: "6581234567",
      timestamp: "2026-07-11T00:00:00.000Z",
      text: "Hello",
      payload: {},
    });

    expect(result.duplicate).toBe(true);
    expect(result.row.id).toBe("event_1");
  });
});
