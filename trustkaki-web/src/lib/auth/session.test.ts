import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
const singleMock = vi.fn();
const selectMock = vi.fn();
const eqMock = vi.fn();
const fromMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: () => ({
    auth: { getUser: getUserMock },
    from: fromMock,
  }),
}));

function request(token?: string): NextRequest {
  return new NextRequest("http://localhost/api/dashboard/state", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function mockCaregiverLookup() {
  fromMock.mockImplementation((table: string) => {
    if (table === "caregivers") {
      return {
        select: () => ({
          eq: () => ({
            single: singleMock,
          }),
        }),
      };
    }
    if (table === "senior_caregivers") {
      return {
        select: selectMock,
      };
    }
    throw new Error(`Unexpected table ${table}`);
  });
  selectMock.mockReturnValue({ eq: eqMock });
  eqMock.mockResolvedValue({
    data: [{ senior_id: "senior-1" }, { senior_id: "senior-2" }],
    error: null,
  });
  singleMock.mockResolvedValue({
    data: {
      id: "caregiver-1",
      display_name: "Rachel Tan",
    },
    error: null,
  });
}

describe("auth session helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    getUserMock.mockReset();
    singleMock.mockReset();
    selectMock.mockReset();
    eqMock.mockReset();
    fromMock.mockReset();
  });

  it("returns 401 when a bearer token is missing", async () => {
    const { requireAuthenticatedCaregiver } = await import("./session");

    const result = await requireAuthenticatedCaregiver(request());

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("maps a verified Supabase user to a caregiver and accessible seniors", async () => {
    mockCaregiverLookup();
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "judge@example.com",
          app_metadata: { role: "demo_admin" },
        },
      },
      error: null,
    });
    const { requireAuthenticatedCaregiver, canAccessSenior } = await import("./session");

    const result = await requireAuthenticatedCaregiver(request("token"));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected auth success");
    expect(result.auth).toMatchObject({
      userId: "auth-user-1",
      email: "judge@example.com",
      role: "demo_admin",
      caregiverId: "caregiver-1",
      caregiverName: "Rachel Tan",
      accessibleSeniorIds: ["senior-1", "senior-2"],
    });
    expect(canAccessSenior(result.auth, "senior-2")).toBe(true);
    expect(canAccessSenior(result.auth, "other-senior")).toBe(false);
  });

  it("requires demo_admin app metadata for demo administration", async () => {
    mockCaregiverLookup();
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "auth-user-1",
          email: "caregiver@example.com",
          app_metadata: { role: "caregiver" },
        },
      },
      error: null,
    });
    const { requireDemoAdmin } = await import("./session");

    const result = await requireDemoAdmin(request("token"));

    expect(result).toMatchObject({ ok: false, status: 403 });
  });
});
