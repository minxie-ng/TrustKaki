import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  retryPendingTelegramEvents: vi.fn(),
  logTelegramError: vi.fn(),
}));

vi.mock("@/lib/telegram/service", () => ({
  retryPendingTelegramEvents: mocks.retryPendingTelegramEvents,
}));

vi.mock("@/lib/telegram/logging", () => ({
  logTelegramError: mocks.logTelegramError,
}));

function request(args?: { authorization?: string; limit?: number }): NextRequest {
  const headers = new Headers({ "content-type": "application/json" });
  if (args?.authorization) headers.set("authorization", args.authorization);
  return new NextRequest("http://localhost/api/internal/telegram/process-pending", {
    method: "POST",
    headers,
    body: JSON.stringify(args?.limit === undefined ? {} : { limit: args.limit }),
  });
}

function getRequest(authorization?: string): NextRequest {
  const headers = new Headers();
  if (authorization) headers.set("authorization", authorization);
  return new NextRequest("http://localhost/api/internal/telegram/process-pending", {
    method: "GET",
    headers,
  });
}

describe("/api/internal/telegram/process-pending", () => {
  beforeEach(() => {
    mocks.retryPendingTelegramEvents.mockReset();
    mocks.logTelegramError.mockReset();
    delete process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET;
    delete process.env.CRON_SECRET;
  });

  it("is unavailable when the processor secret is not configured", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());

    expect(response.status).toBe(404);
    expect(mocks.retryPendingTelegramEvents).not.toHaveBeenCalled();
  });

  it("rejects missing and invalid authorization", async () => {
    const { POST } = await import("./route");
    process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET = "processor_secret";

    const missing = await POST(request());
    const invalid = await POST(request({ authorization: "Bearer wrong" }));

    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
    expect(mocks.retryPendingTelegramEvents).not.toHaveBeenCalled();
  });

  it("bounds the requested limit and returns only safe result categories", async () => {
    const { POST } = await import("./route");
    process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET = "processor_secret";
    mocks.retryPendingTelegramEvents.mockResolvedValue({
      processed: 2,
      failed: 1,
      skipped: 0,
      statuses: ["processed", "senior_not_found", "error"],
    });

    const response = await POST(
      request({ authorization: "Bearer processor_secret", limit: 999 })
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.retryPendingTelegramEvents).toHaveBeenCalledWith({ limit: 25 });
    expect(body).toEqual({
      status: "processed",
      limit: 25,
      processed: 2,
      failed: 1,
      skipped: 0,
      statuses: ["processed", "senior_not_found", "error"],
    });
    expect(JSON.stringify(body)).not.toContain("processor_secret");
  });

  it("supports the same protected bounded processing from Vercel Cron GET", async () => {
    const { GET } = await import("./route");
    process.env.CRON_SECRET = "cron_secret";
    mocks.retryPendingTelegramEvents.mockResolvedValue({
      processed: 1,
      failed: 0,
      skipped: 0,
      statuses: ["processed"],
    });

    const response = await GET(getRequest("Bearer cron_secret"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(mocks.retryPendingTelegramEvents).toHaveBeenCalledWith({ limit: 10 });
    expect(body).toMatchObject({ status: "processed", processed: 1, failed: 0 });
  });
});
