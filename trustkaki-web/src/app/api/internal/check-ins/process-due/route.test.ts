import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const processDueProactiveJobsMock = vi.fn();
const retryPendingTelegramEventsMock = vi.fn();

vi.mock("@/lib/checkins/service", () => ({
  processDueProactiveJobs: processDueProactiveJobsMock,
}));

vi.mock("@/lib/telegram/service", () => ({
  retryPendingTelegramEvents: retryPendingTelegramEventsMock,
}));

function request(method: "GET" | "POST", authorization?: string) {
  return new NextRequest("http://localhost/api/internal/check-ins/process-due", {
    method,
    headers: authorization ? { authorization } : undefined,
  });
}

describe("/api/internal/check-ins/process-due", () => {
  beforeEach(() => {
    vi.resetModules();
    processDueProactiveJobsMock.mockReset();
    retryPendingTelegramEventsMock.mockReset();
    retryPendingTelegramEventsMock.mockResolvedValue({
      processed: 0,
      failed: 0,
      skipped: 0,
      statuses: [],
    });
    delete process.env.CRON_SECRET;
  });

  it("fails closed when the cron secret is not configured", async () => {
    const { GET } = await import("./route");

    const response = await GET(request("GET"));

    expect(response.status).toBe(404);
    expect(processDueProactiveJobsMock).not.toHaveBeenCalled();
  });

  it.each(["missing", "wrong"])(
    "rejects %s authorization without processing",
    async (kind) => {
      process.env.CRON_SECRET = "cron-private-value";
      const { GET } = await import("./route");
      const response = await GET(
        request(
          "GET",
          kind === "wrong" ? "Bearer wrong-private-value" : undefined
        )
      );

      expect(response.status).toBe(401);
      expect(processDueProactiveJobsMock).not.toHaveBeenCalled();
      expect(JSON.stringify(await response.json())).not.toMatch(
        /cron-private-value|wrong-private-value/
      );
    }
  );

  it("runs a bounded batch for an authorized Vercel GET", async () => {
    process.env.CRON_SECRET = "cron-private-value";
    processDueProactiveJobsMock.mockResolvedValue({
      claimed: 3,
      processed: 2,
      failed: 1,
    });
    const { GET } = await import("./route");

    const response = await GET(
      request("GET", "Bearer cron-private-value")
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(processDueProactiveJobsMock).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 10 })
    );
    expect(retryPendingTelegramEventsMock).toHaveBeenCalledWith({ limit: 10 });
    expect(
      retryPendingTelegramEventsMock.mock.invocationCallOrder[0]
    ).toBeLessThan(processDueProactiveJobsMock.mock.invocationCallOrder[0]);
    expect(json).toEqual({ status: "processed", claimed: 3, processed: 2, failed: 1 });
  });

  it("uses the same protected path for manual server-side POST invocation", async () => {
    process.env.CRON_SECRET = "cron-private-value";
    processDueProactiveJobsMock.mockResolvedValue({
      claimed: 0,
      processed: 0,
      failed: 0,
    });
    const { POST } = await import("./route");

    const response = await POST(
      request("POST", "Bearer cron-private-value")
    );

    expect(response.status).toBe(200);
    expect(processDueProactiveJobsMock).toHaveBeenCalledOnce();
  });

  it("returns a safe failure without provider or persistence details", async () => {
    process.env.CRON_SECRET = "cron-private-value";
    processDueProactiveJobsMock.mockRejectedValue(
      new Error("telegram chat 123 and database details")
    );
    const { GET } = await import("./route");

    const response = await GET(
      request("GET", "Bearer cron-private-value")
    );
    const body = JSON.stringify(await response.json());

    expect(response.status).toBe(500);
    expect(body).toBe('{"status":"error"}');
  });
});
