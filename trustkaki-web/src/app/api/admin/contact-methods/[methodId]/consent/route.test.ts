import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const recordConsent = vi.fn();
class ContactPlanForbiddenError extends Error {}
vi.mock("@/lib/auth/session", () => ({
  requireOrganisationAdmin: requireAdmin,
  authJsonError: (result: { status: number; error: string }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/contactPlanRepository", () => ({
  contactPlanCommands: { recordConsent },
  ContactPlanConflictError: class extends Error {},
  ContactPlanForbiddenError,
}));

const commandId = "00000000-0000-4000-8000-000000000099";

describe("POST contact consent", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAdmin.mockReset();
    recordConsent.mockReset();
    requireAdmin.mockResolvedValue({ ok: true, accessToken: "admin-token" });
    recordConsent.mockResolvedValue({ id: commandId, duplicate: false });
  });

  it("rejects non-admin users", async () => {
    requireAdmin.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST", body: JSON.stringify({}),
    }), { params: Promise.resolve({ methodId: commandId }) });
    expect(response.status).toBe(403);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("records an auditable consent command", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        commandId,
        eventType: "granted",
        categories: ["urgent_safety"],
        allowUrgentQuietHours: true,
        confirmationMethod: "verbal",
        confirmedAt: "2026-07-14T02:00:00.000Z",
        note: "Confirmed directly with the family contact.",
      }),
    }), { params: Promise.resolve({ methodId: commandId }) });
    expect(response.status).toBe(200);
    expect(recordConsent).toHaveBeenCalledWith("admin-token", expect.objectContaining({
      p_method_id: commandId,
      p_event_type: "granted",
      p_allow_urgent_quiet_hours: true,
    }));
  });

  it("returns a bounded forbidden response when the database rejects the target", async () => {
    recordConsent.mockRejectedValueOnce(
      new ContactPlanForbiddenError("private database detail")
    );
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost", {
      method: "POST",
      body: JSON.stringify({
        commandId,
        eventType: "granted",
        categories: ["urgent_safety"],
        allowUrgentQuietHours: true,
        confirmationMethod: "verbal",
        confirmedAt: "2026-07-14T02:00:00.000Z",
        note: "Confirmed directly with the family contact.",
      }),
    }), { params: Promise.resolve({ methodId: commandId }) });

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
  });
});
