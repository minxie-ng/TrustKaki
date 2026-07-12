import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const acceptWhatsAppWebhookEventMock = vi.fn();
const processWhatsAppEventByIdMock = vi.fn();
const requireDemoAdminMock = vi.fn();

const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "demo_admin",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: ["00000000-0000-0000-0000-000000000001"],
};

vi.mock("@/lib/whatsapp/service", () => ({
  acceptWhatsAppWebhookEvent: acceptWhatsAppWebhookEventMock,
  processWhatsAppEventById: processWhatsAppEventByIdMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireDemoAdmin: requireDemoAdminMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
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
    requireDemoAdminMock.mockReset();
    requireDemoAdminMock.mockResolvedValue({ ok: true, auth });
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

  it("requires demo_admin authorization when the simulator is enabled", async () => {
    const { POST } = await import("./route");
    process.env.ENABLE_WHATSAPP_DEV_SIMULATOR = "true";
    requireDemoAdminMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Forbidden",
    });

    const response = await POST(
      request({
        messageId: "wamid.local",
        from: "6581234567",
        text: "Not hungry today. Knee pain.",
      })
    );

    expect(response.status).toBe(403);
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
