import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const retryPendingWhatsAppEventsMock = vi.fn();

vi.mock("@/lib/whatsapp/service", () => ({
  retryPendingWhatsAppEvents: retryPendingWhatsAppEventsMock,
}));

function request(init?: ConstructorParameters<typeof NextRequest>[1]): NextRequest {
  return new NextRequest("http://localhost/api/internal/whatsapp/process-pending", init);
}

describe("/api/internal/whatsapp/process-pending", () => {
  beforeEach(() => {
    retryPendingWhatsAppEventsMock.mockReset();
    delete process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET;
  });

  it("is disabled unless the processor secret is configured", async () => {
    const { POST } = await import("./route");

    const response = await POST(request({ method: "POST", body: "{}" }));

    expect(response.status).toBe(404);
    expect(retryPendingWhatsAppEventsMock).not.toHaveBeenCalled();
  });

  it("rejects missing or invalid authorization", async () => {
    const { POST } = await import("./route");
    process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET = "processor_secret";

    const response = await POST(request({ method: "POST", body: "{}" }));

    expect(response.status).toBe(401);
    expect(retryPendingWhatsAppEventsMock).not.toHaveBeenCalled();
  });

  it("processes a bounded number of pending events", async () => {
    const { POST } = await import("./route");
    process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET = "processor_secret";
    retryPendingWhatsAppEventsMock.mockResolvedValue({
      processed: 1,
      failed: 0,
      skipped: 0,
      statuses: ["processed"],
    });

    const response = await POST(
      request({
        method: "POST",
        headers: { authorization: "Bearer processor_secret" },
        body: JSON.stringify({ limit: 99 }),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(retryPendingWhatsAppEventsMock).toHaveBeenCalledWith({ limit: 25 });
    expect(json).toMatchObject({
      processed: 1,
      failed: 0,
      skipped: 0,
    });
    expect(JSON.stringify(json)).not.toContain("processor_secret");
  });
});
