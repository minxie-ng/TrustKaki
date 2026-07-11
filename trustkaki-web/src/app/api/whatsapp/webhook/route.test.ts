import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  acceptWhatsAppWebhookEvent: vi.fn(),
  processWhatsAppEventById: vi.fn(),
  after: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return {
    ...actual,
    after: mocks.after,
  };
});

vi.mock("@/lib/whatsapp/service", () => ({
  acceptWhatsAppWebhookEvent: mocks.acceptWhatsAppWebhookEvent,
  processWhatsAppEventById: mocks.processWhatsAppEventById,
}));

function request(
  url: string,
  init?: ConstructorParameters<typeof NextRequest>[1]
): NextRequest {
  return new NextRequest(url, init);
}

describe("/api/whatsapp/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.acceptWhatsAppWebhookEvent.mockReset();
    mocks.processWhatsAppEventById.mockReset();
    mocks.after.mockReset();
    process.env.WHATSAPP_VERIFY_TOKEN = "verify_secret";
    delete process.env.META_APP_SECRET;
  });

  it("returns the challenge for valid GET verification", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      request(
        "http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=verify_secret&hub.challenge=abc123"
      )
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("abc123");
  });

  it("returns 403 for invalid verify token", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      request(
        "http://localhost/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=abc123"
      )
    );

    expect(response.status).toBe(403);
  });

  it("returns 200 after durable acceptance and schedules processing", async () => {
    const { POST } = await import("./route");
    mocks.acceptWhatsAppWebhookEvent.mockResolvedValue({
      status: "accepted",
      events: [
        {
          eventId: "event_1",
          whatsappMessageId: "wamid.inbound",
          eventType: "inbound_text",
          duplicate: false,
          processable: true,
        },
      ],
    });

    const response = await POST(
      request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ entry: [] }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      status: "accepted",
      result: "accepted",
      accepted: 1,
      scheduled: 1,
      signature: "pending",
    });
    expect(mocks.acceptWhatsAppWebhookEvent).toHaveBeenCalledTimes(1);
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processWhatsAppEventById).not.toHaveBeenCalled();
  });

  it("returns 200 for duplicate events without scheduling processing", async () => {
    const { POST } = await import("./route");
    mocks.acceptWhatsAppWebhookEvent.mockResolvedValue({
      status: "duplicate",
      events: [
        {
          eventId: "event_1",
          whatsappMessageId: "wamid.inbound",
          eventType: "inbound_text",
          duplicate: true,
          processable: false,
        },
      ],
    });

    const response = await POST(
      request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ entry: [] }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.result).toBe("duplicate");
    expect(json.scheduled).toBe(0);
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns safe 200 for unsupported POST events", async () => {
    const { POST } = await import("./route");
    mocks.acceptWhatsAppWebhookEvent.mockResolvedValue({
      status: "ignored",
      events: [],
      reason: "No supported WhatsApp text or status event",
    });

    const response = await POST(
      request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ entry: [] }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({
      status: "accepted",
      result: "ignored",
      accepted: 0,
      scheduled: 0,
    });
  });

  it("returns 503 when durable acceptance fails", async () => {
    const { POST } = await import("./route");
    mocks.acceptWhatsAppWebhookEvent.mockRejectedValue(new Error("database down"));

    const response = await POST(
      request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ entry: [] }),
      })
    );
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("database down");
  });

  it("returns 403 for invalid signatures when app secret is configured", async () => {
    const { POST } = await import("./route");
    process.env.META_APP_SECRET = "app_secret";

    const response = await POST(
      request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        headers: { "x-hub-signature-256": "sha256=bad" },
        body: JSON.stringify({ entry: [] }),
      })
    );

    expect(response.status).toBe(403);
    expect(mocks.acceptWhatsAppWebhookEvent).not.toHaveBeenCalled();
  });

  it("does not leak secret values in API responses", async () => {
    const { POST } = await import("./route");
    process.env.WHATSAPP_ACCESS_TOKEN = "super_secret_access_token";
    mocks.acceptWhatsAppWebhookEvent.mockRejectedValue(
      new Error("super_secret_access_token internal failure")
    );

    const response = await POST(
      request("http://localhost/api/whatsapp/webhook", {
        method: "POST",
        body: JSON.stringify({ entry: [] }),
      })
    );
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("super_secret_access_token");
    expect(text).not.toContain("internal failure");
  });
});
