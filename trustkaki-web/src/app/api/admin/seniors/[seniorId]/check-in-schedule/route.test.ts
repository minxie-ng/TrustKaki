import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const canAccessSenior = vi.fn();
const readScheduleOverviewForSenior = vi.fn();
const saveScheduleCommand = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireDemoAdmin: requireAdmin,
  canAccessSenior,
  authJsonError: (result: { status: number; error: string }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/proactiveCheckInRepository", () => ({
  readScheduleOverviewForSenior,
  saveScheduleCommand,
  ProactiveCheckInConflictError: class extends Error {},
}));

const seniorId = "00000000-0000-4000-8000-000000000001";
const commandId = "00000000-0000-4000-8000-000000000099";
const body = {
  commandId,
  action: "manual_run",
  platform: "telegram",
  localSendTime: "09:00",
  timezone: "Asia/Singapore",
  activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
  initialResponseMinutes: 120,
  retryResponseMinutes: 60,
  initialMessageTemplate: "Good morning. How are you today?",
  retryMessageTemplate: "Just checking again. Reply when convenient.",
  reason: null,
};

describe("admin proactive check-in schedule route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      ok: true,
      accessToken: "admin-token",
      auth: { accessibleSeniorIds: [seniorId], role: "demo_admin" },
    });
    canAccessSenior.mockReturnValue(true);
    readScheduleOverviewForSenior.mockResolvedValue({ schedule: null, state: "not_configured" });
    saveScheduleCommand.mockResolvedValue({
      scheduleId: seniorId,
      workflowId: commandId,
      duplicate: false,
    });
  });

  it("rejects non-admin and inaccessible senior requests", async () => {
    requireAdmin.mockResolvedValueOnce({ ok: false, status: 403, error: "Forbidden" });
    const route = await import("./route");
    const deniedAdmin = await route.GET(new Request("http://localhost"), {
      params: Promise.resolve({ seniorId }),
    });
    requireAdmin.mockResolvedValueOnce({
      ok: true,
      accessToken: "admin-token",
      auth: { accessibleSeniorIds: [], role: "demo_admin" },
    });
    canAccessSenior.mockReturnValueOnce(false);
    const deniedSenior = await route.POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ seniorId }) });

    expect(deniedAdmin.status).toBe(403);
    expect(deniedSenior.status).toBe(403);
    expect(saveScheduleCommand).not.toHaveBeenCalled();
  });

  it("loads the authorized senior schedule", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ seniorId }),
    });

    expect(response.status).toBe(200);
    expect(readScheduleOverviewForSenior).toHaveBeenCalledWith({
      accessToken: "admin-token",
      seniorId,
    });
  });

  it("enqueues manual runs through the transactional command", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }), { params: Promise.resolve({ seniorId }) });

    expect(response.status).toBe(200);
    expect(saveScheduleCommand).toHaveBeenCalledWith(
      "admin-token",
      expect.objectContaining({
        seniorId,
        commandId,
        action: "manual_run",
        now: expect.any(String),
      })
    );
  });

  it("rejects a short pause reason before calling the database", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({ ...body, action: "pause", reason: "Busy" }),
    }), { params: Promise.resolve({ seniorId }) });

    expect(response.status).toBe(400);
    expect(saveScheduleCommand).not.toHaveBeenCalled();
  });
});
