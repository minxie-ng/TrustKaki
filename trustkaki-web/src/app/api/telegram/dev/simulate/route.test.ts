import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  acceptTelegramWebhookEvent: vi.fn(),
  processTelegramEventById: vi.fn(),
  requireDemoAdmin: vi.fn(),
  logTelegramError: vi.fn(),
}));

const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "demo_admin",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: ["00000000-0000-0000-0000-000000000001"],
};

vi.mock("@/lib/telegram/service", () => ({
  acceptTelegramWebhookEvent: mocks.acceptTelegramWebhookEvent,
  processTelegramEventById: mocks.processTelegramEventById,
}));

vi.mock("@/lib/telegram/logging", () => ({
  logTelegramError: mocks.logTelegramError,
}));

vi.mock("@/lib/auth/session", () => ({
  requireDemoAdmin: mocks.requireDemoAdmin,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

function request(): NextRequest {
  return new NextRequest("http://localhost/api/telegram/dev/simulate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      updateId: 700001,
      messageId: 800001,
      senderUserId: 900001,
      chatId: 900001,
      timestamp: 1784102400,
      text: "Not hungry today. Knee pain.",
    }),
  });
}

describe("/api/telegram/dev/simulate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    delete process.env.ENABLE_TELEGRAM_DEV_SIMULATOR;
    mocks.acceptTelegramWebhookEvent.mockReset();
    mocks.processTelegramEventById.mockReset();
    mocks.requireDemoAdmin.mockReset();
    mocks.logTelegramError.mockReset();
    mocks.requireDemoAdmin.mockResolvedValue({ ok: true, auth });
  });

  it("is unavailable in production and when its explicit flag is disabled", async () => {
    const { POST } = await import("./route");

    vi.stubEnv("NODE_ENV", "production");
    const production = await POST(request());
    vi.stubEnv("NODE_ENV", "test");
    const disabled = await POST(request());

    expect(production.status).toBe(404);
    expect(disabled.status).toBe(404);
    expect(mocks.acceptTelegramWebhookEvent).not.toHaveBeenCalled();
  });

  it("requires demo administrator authorization", async () => {
    const { POST } = await import("./route");
    process.env.ENABLE_TELEGRAM_DEV_SIMULATOR = "true";
    mocks.requireDemoAdmin.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Forbidden",
    });

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mocks.acceptTelegramWebhookEvent).not.toHaveBeenCalled();
  });

  it("processes one local simulation and deduplicates its identical retry", async () => {
    const { POST } = await import("./route");
    process.env.ENABLE_TELEGRAM_DEV_SIMULATOR = "true";
    mocks.acceptTelegramWebhookEvent
      .mockResolvedValueOnce({
        status: "accepted",
        eventId: "event-internal-1",
        duplicate: false,
      })
      .mockResolvedValueOnce({
        status: "duplicate",
        eventId: "event-internal-1",
        duplicate: true,
      });
    mocks.processTelegramEventById.mockImplementation(async (_eventId, options) => {
      await options.outboundClient.sendText({
        chatId: "900001",
        text: "Please eat something light and let Rachel know if the pain continues.",
      });
      return {
        status: "processed",
        inboundMessageId: "800001",
        outboundMessageId: "810001",
      };
    });

    const firstResponse = await POST(request());
    const firstBody = await firstResponse.json();
    const secondResponse = await POST(request());
    const secondBody = await secondResponse.json();
    const serialized = JSON.stringify({ firstBody, secondBody });

    expect(firstResponse.status).toBe(200);
    expect(secondResponse.status).toBe(200);
    expect(mocks.acceptTelegramWebhookEvent).toHaveBeenCalledTimes(2);
    expect(mocks.processTelegramEventById).toHaveBeenCalledTimes(1);
    expect(firstBody).toMatchObject({
      status: "accepted",
      result: "processed",
      persisted: true,
      outboundRequestCount: 1,
      outboundRequestBody: {
        chat_id: "[redacted]",
        text: "Please eat something light and let Rachel know if the pain continues.",
      },
    });
    expect(secondBody).toEqual({
      status: "accepted",
      result: "duplicate",
      persisted: true,
      outboundRequestCount: 0,
    });
    expect(serialized).not.toContain("900001");
    expect(serialized).not.toContain("800001");
    expect(serialized).not.toContain("810001");
    expect(serialized).not.toContain("event-internal-1");
  });

});
