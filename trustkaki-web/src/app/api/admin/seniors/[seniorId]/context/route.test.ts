import { beforeEach, describe, expect, it, vi } from "vitest";

const requireAdmin = vi.fn();
const canAdministerSenior = vi.fn();
const mutateSeniorContext = vi.fn();
const readSeniorContext = vi.fn();

class ContextConflictError extends Error {}

vi.mock("@/lib/auth/session", () => ({
  requireOrganisationAdmin: requireAdmin,
  canAdministerSenior,
  authJsonError: (result: { status: number; error: string }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

vi.mock("@/lib/persistence/memoryRepository", () => ({
  ContextConflictError,
  mutateSeniorContext,
  readSeniorContext,
}));

const seniorId = "00000000-0000-4000-8000-000000000001";
const body = {
  action: "archive",
  commandId: "00000000-0000-4000-8000-000000000099",
  contextId: "00000000-0000-4000-8000-000000000088",
  store: "memory",
  expectedUpdatedAt: "2026-07-16T02:00:00.000Z",
  reason: "Archived after caregiver review.",
};

describe("admin senior context route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAdmin.mockResolvedValue({
      ok: true,
      accessToken: "admin-token",
      auth: { administrableSeniorIds: [seniorId] },
    });
    canAdministerSenior.mockReturnValue(true);
    mutateSeniorContext.mockResolvedValue({ duplicate: false });
    readSeniorContext.mockResolvedValue({ seniorId, items: [] });
  });

  it("requires organisation admin and senior access before mutation", async () => {
    requireAdmin.mockResolvedValueOnce({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
    const route = await import("./route");
    const deniedRole = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ seniorId }) }
    );
    requireAdmin.mockResolvedValueOnce({
      ok: true,
      accessToken: "admin-token",
      auth: { administrableSeniorIds: [] },
    });
    canAdministerSenior.mockReturnValueOnce(false);
    const deniedSenior = await route.POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ seniorId }) }
    );

    expect(deniedRole.status).toBe(403);
    expect(deniedSenior.status).toBe(403);
    expect(mutateSeniorContext).not.toHaveBeenCalled();
  });

  it("returns only the refreshed read model after an archive", async () => {
    const { POST } = await import("./route");
    const response = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ seniorId }) }
    );

    expect(response.status).toBe(200);
    expect(mutateSeniorContext).toHaveBeenCalledWith({
      accessToken: "admin-token",
      seniorId,
      command: body,
    });
    expect(await response.json()).toEqual({ context: { seniorId, items: [] } });
  });

  it("rejects short reasons before mutation and maps stale versions to 409", async () => {
    const { POST } = await import("./route");
    const invalid = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ ...body, reason: "Too short" }),
      }),
      { params: Promise.resolve({ seniorId }) }
    );
    mutateSeniorContext.mockRejectedValueOnce(new ContextConflictError());
    const stale = await POST(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify(body),
      }),
      { params: Promise.resolve({ seniorId }) }
    );

    expect(invalid.status).toBe(400);
    expect(stale.status).toBe(409);
  });
});
