import { beforeEach, describe, expect, it, vi } from "vitest";

const resetDemoPersistenceMock = vi.fn();
const requireDemoAdminMock = vi.fn();

const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "demo_admin",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: ["00000000-0000-0000-0000-000000000001"],
};
const accessToken = "verified-access-token";

vi.mock("@/lib/persistence/demoRepository", () => ({
  resetDemoPersistence: resetDemoPersistenceMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireDemoAdmin: requireDemoAdminMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

describe("/api/demo/reset", () => {
  beforeEach(() => {
    vi.resetModules();
    resetDemoPersistenceMock.mockReset();
    requireDemoAdminMock.mockReset();
    requireDemoAdminMock.mockResolvedValue({ ok: true, auth, accessToken });
  });

  it("requires demo_admin authorization", async () => {
    requireDemoAdminMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/reset"));

    expect(response.status).toBe(403);
    expect(resetDemoPersistenceMock).not.toHaveBeenCalled();
  });

  it("resets persisted demo state", async () => {
    resetDemoPersistenceMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/reset"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.persistence.persisted).toBe(true);
    expect(resetDemoPersistenceMock).toHaveBeenCalledWith({ accessToken });
  });

  it("returns a safe error when reset fails", async () => {
    resetDemoPersistenceMock.mockRejectedValue(new Error("database secret detail"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/reset"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to reset demo data");
  });
});
