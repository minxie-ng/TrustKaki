import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAuth = vi.fn();
const readSeniorContext = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuth,
  canAccessSenior: (auth: { accessibleSeniorIds: string[] }, id: string) =>
    auth.accessibleSeniorIds.includes(id),
  authJsonError: (result: { status: number; error: string }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

vi.mock("@/lib/persistence/memoryRepository", () => ({
  readSeniorContext,
}));

const seniorId = "00000000-0000-4000-8000-000000000001";

describe("GET senior context", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAuth.mockResolvedValue({
      ok: true,
      accessToken: "caregiver-token",
      auth: { accessibleSeniorIds: [seniorId] },
    });
    readSeniorContext.mockResolvedValue({ seniorId, items: [] });
  });

  it("returns shared context to an authorized caregiver", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ seniorId }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ context: { seniorId, items: [] } });
    expect(readSeniorContext).toHaveBeenCalledWith({
      accessToken: "caregiver-token",
      seniorId,
      now: expect.any(String),
    });
  });

  it("rejects unrelated caregivers before any context read", async () => {
    requireAuth.mockResolvedValue({
      ok: true,
      accessToken: "unrelated-token",
      auth: { accessibleSeniorIds: [] },
    });
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ seniorId }),
    });

    expect(response.status).toBe(403);
    expect(readSeniorContext).not.toHaveBeenCalled();
  });
});
