import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  acceptTelegramWebhookEvent: vi.fn(),
  processTelegramEventById: vi.fn(),
  after: vi.fn(),
  logTelegramError: vi.fn(),
}));

vi.mock("next/server", async () => {
  const actual = await vi.importActual<typeof import("next/server")>("next/server");
  return { ...actual, after: mocks.after };
});

vi.mock("@/lib/telegram/service", () => ({
  acceptTelegramWebhookEvent: mocks.acceptTelegramWebhookEvent,
  processTelegramEventById: mocks.processTelegramEventById,
}));

vi.mock("@/lib/telegram/logging", () => ({
  logTelegramError: mocks.logTelegramError,
}));

function request(args?: { secret?: string; body?: unknown }): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (args?.secret) {
    headers.set("x-telegram-bot-api-secret-token", args.secret);
  }
  return new NextRequest("http://localhost/api/telegram/webhook", {
    method: "POST",
    headers,
    body: JSON.stringify(args?.body ?? { update_id: 123 }),
  });
}

describe("/api/telegram/webhook", () => {
  beforeEach(() => {
    vi.resetModules();
    mocks.acceptTelegramWebhookEvent.mockReset();
    mocks.processTelegramEventById.mockReset();
    mocks.after.mockReset();
    mocks.logTelegramError.mockReset();
    process.env.TELEGRAM_WEBHOOK_SECRET = "telegram_webhook_secret";
  });

  it("returns 403 when the webhook secret is missing or invalid", async () => {
    const { POST } = await import("./route");

    const missing = await POST(request());
    const invalid = await POST(request({ secret: "wrong" }));

    expect(missing.status).toBe(403);
    expect(invalid.status).toBe(403);
    expect(mocks.acceptTelegramWebhookEvent).not.toHaveBeenCalled();
  });

  it("durably accepts before scheduling processing", async () => {
    const { POST } = await import("./route");
    mocks.acceptTelegramWebhookEvent.mockResolvedValue({
      status: "accepted",
      eventId: "event-internal-1",
      duplicate: false,
    });

    const response = await POST(
      request({ secret: "telegram_webhook_secret", body: { update_id: 987654321 } })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "accepted",
      result: "accepted",
      scheduled: true,
    });
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.processTelegramEventById).not.toHaveBeenCalled();
    expect(JSON.stringify(body)).not.toContain("987654321");
    expect(JSON.stringify(body)).not.toContain("event-internal-1");
  });

  it("returns 200 for a duplicate without scheduling it", async () => {
    const { POST } = await import("./route");
    mocks.acceptTelegramWebhookEvent.mockResolvedValue({
      status: "duplicate",
      eventId: "event-internal-1",
      duplicate: true,
    });

    const response = await POST(request({ secret: "telegram_webhook_secret" }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual({
      status: "accepted",
      result: "duplicate",
      scheduled: false,
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns safe 200 for unsupported updates", async () => {
    const { POST } = await import("./route");
    mocks.acceptTelegramWebhookEvent.mockResolvedValue({ status: "ignored" });

    const response = await POST(request({ secret: "telegram_webhook_secret" }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      status: "accepted",
      result: "ignored",
      scheduled: false,
    });
    expect(mocks.after).not.toHaveBeenCalled();
  });

  it("returns a retryable non-2xx response when durable acceptance fails", async () => {
    const { POST } = await import("./route");
    process.env.TELEGRAM_BOT_TOKEN = "123456:super_secret_token";
    mocks.acceptTelegramWebhookEvent.mockRejectedValue(
      new Error("123456:super_secret_token database down for 987654321")
    );

    const response = await POST(request({ secret: "telegram_webhook_secret" }));
    const text = await response.text();

    expect(response.status).toBe(503);
    expect(text).not.toContain("super_secret_token");
    expect(text).not.toContain("987654321");
    expect(text).not.toContain("database down");
  });
});
