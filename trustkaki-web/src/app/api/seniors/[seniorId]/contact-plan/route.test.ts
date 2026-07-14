import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.fn();
const readPlan = vi.fn();
vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuth,
  canAccessSenior: (auth: { accessibleSeniorIds: string[] }, id: string) =>
    auth.accessibleSeniorIds.includes(id),
  authJsonError: (result: { status: number; error: string }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/contactPlanRepository", () => ({
  readMaskedContactPlan: readPlan,
}));

describe("GET senior contact plan", () => {
  beforeEach(() => {
    vi.resetModules();
    requireAuth.mockReset();
    readPlan.mockReset();
    requireAuth.mockResolvedValue({
      ok: true,
      auth: { accessibleSeniorIds: ["senior-1"] },
    });
    readPlan.mockResolvedValue({ seniorId: "senior-1", contacts: [] });
  });

  it("returns a masked plan to an authorized caregiver", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ seniorId: "senior-1" }),
    });
    expect(response.status).toBe(200);
    expect(readPlan).toHaveBeenCalledWith({ seniorId: "senior-1" });
  });

  it("rejects an unrelated caregiver before reading", async () => {
    requireAuth.mockResolvedValue({
      ok: true,
      auth: { accessibleSeniorIds: ["senior-2"] },
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ seniorId: "senior-1" }),
    });
    expect(response.status).toBe(403);
    expect(readPlan).not.toHaveBeenCalled();
  });
});
