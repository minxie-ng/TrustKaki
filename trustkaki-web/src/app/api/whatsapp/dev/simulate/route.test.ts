import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const acceptWhatsAppWebhookEventMock = vi.fn();
const processWhatsAppEventByIdMock = vi.fn();

vi.mock("@/lib/whatsapp/service", () => ({
  acceptWhatsAppWebhookEvent: acceptWhatsAppWebhookEventMock,
  processWhatsAppEventById: processWhatsAppEventByIdMock,
}));

function request(body: Record<string, unknown>): NextRequest {
  return new NextRequest("http://localhost/api/whatsapp/dev/simulate", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("/api/whatsapp/dev/simulate", () => {
  beforeEach(() => {
    acceptWhatsAppWebhookEventMock.mockReset();
    processWhatsAppEventByIdMock.mockReset();
    delete process.env.ENABLE_WHATSAPP_DEV_SIMULATOR;
  });

  it("is disabled without the explicit dev simulator flag", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      request({
        messageId: "wamid.local",
        from: "6581234567",
        text: "Not hungry today. Knee pain.",
      })
    );

    expect(response.status).toBe(404);
    expect(acceptWhatsAppWebhookEventMock).not.toHaveBeenCalled();
  });

  it("enters through durable acceptance and processes a new event", async () => {
    const { POST } = await import("./route");
    process.env.ENABLE_WHATSAPP_DEV_SIMULATOR = "true";
    acceptWhatsAppWebhookEventMock.mockResolvedValue({
      status: "accepted",
      events: [
        {
          eventId: "event_1",
          whatsappMessageId: "wamid.local",
          eventType: "inbound_text",
          duplicate: false,
          processable: true,
        },
      ],
    });
    processWhatsAppEventByIdMock.mockResolvedValue({
      status: "processed",
      inboundMessageId: "wamid.local",
      outboundMessageId: "dev_wamid.local",
    });

    const response = await POST(
      request({
        messageId: "wamid.local",
        from: "6581234567",
        text: "Not hungry today. Knee pain.",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(acceptWhatsAppWebhookEventMock).toHaveBeenCalledTimes(1);
    expect(processWhatsAppEventByIdMock).toHaveBeenCalledTimes(1);
    expect(json).toMatchObject({
      result: "processed",
      inboundMessageId: "wamid.local",
      outboundMessageId: "dev_wamid.local",
    });
  });

  it("does not reprocess duplicate simulated deliveries", async () => {
    const { POST } = await import("./route");
    process.env.ENABLE_WHATSAPP_DEV_SIMULATOR = "true";
    acceptWhatsAppWebhookEventMock.mockResolvedValue({
      status: "duplicate",
      events: [
        {
          eventId: "event_1",
          whatsappMessageId: "wamid.local",
          eventType: "inbound_text",
          duplicate: true,
          processable: false,
        },
      ],
    });

    const response = await POST(
      request({
        messageId: "wamid.local",
        from: "6581234567",
        text: "Not hungry today. Knee pain.",
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe("duplicate");
    expect(processWhatsAppEventByIdMock).not.toHaveBeenCalled();
  });
});
