import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const getUserMock = vi.fn();
const caregiverSingleMock = vi.fn();
const serviceFromMock = vi.fn();
const userFromMock = vi.fn();
const createUserClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: () => ({
    auth: { getUser: getUserMock },
    from: serviceFromMock,
  }),
  createTrustKakiUserClient: createUserClientMock,
}));

const organisationId = "00000000-0000-4000-8000-000000000010";
const otherOrganisationId = "00000000-0000-4000-8000-000000000020";
const seniorId = "00000000-0000-4000-8000-000000000011";
const familySeniorId = "00000000-0000-4000-8000-000000000021";

function request(token?: string): NextRequest {
  return new NextRequest("http://localhost/api/dashboard/state", {
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
}

function mockAuthenticatedLookups(args?: {
  appRole?: string | null;
  memberships?: Array<{ organisation_id: string; role: string }>;
  seniors?: Array<{ id: string; organisation_id: string }>;
  membershipError?: { message: string } | null;
  seniorError?: { message: string } | null;
}) {
  getUserMock.mockResolvedValue({
    data: {
      user: {
        id: "00000000-0000-4000-8000-000000000099",
        email: "judge@example.com",
        app_metadata: args?.appRole ? { role: args.appRole } : {},
      },
    },
    error: null,
  });
  caregiverSingleMock.mockResolvedValue({
    data: {
      id: "00000000-0000-4000-8000-000000000098",
      display_name: "Rachel Tan",
    },
    error: null,
  });
  serviceFromMock.mockReturnValue({
    select: () => ({
      eq: () => ({ single: caregiverSingleMock }),
    }),
  });
  userFromMock.mockImplementation((table: string) => {
    if (table === "organisation_memberships") {
      return {
        select: () => ({
          eq: () => ({
            eq: () =>
              Promise.resolve({
                data: args?.memberships ?? [],
                error: args?.membershipError ?? null,
              }),
          }),
        }),
      };
    }
    if (table === "seniors") {
      return {
        select: () =>
          Promise.resolve({
            data: args?.seniors ?? [],
            error: args?.seniorError ?? null,
          }),
      };
    }
    throw new Error(`Unexpected user table ${table}`);
  });
  createUserClientMock.mockReturnValue({ from: userFromMock });
}

describe("auth session helpers", () => {
  beforeEach(() => {
    vi.resetModules();
    getUserMock.mockReset();
    caregiverSingleMock.mockReset();
    serviceFromMock.mockReset();
    userFromMock.mockReset();
    createUserClientMock.mockReset();
  });

  it("returns 401 when a bearer token is missing", async () => {
    const { requireAuthenticatedCaregiver } = await import("./session");

    const result = await requireAuthenticatedCaregiver(request());

    expect(result).toMatchObject({ ok: false, status: 401 });
    expect(getUserMock).not.toHaveBeenCalled();
  });

  it("maps RLS-filtered seniors and active organisation memberships", async () => {
    mockAuthenticatedLookups({
      appRole: "demo_admin",
      memberships: [{ organisation_id: organisationId, role: "org_admin" }],
      seniors: [
        { id: seniorId, organisation_id: organisationId },
        { id: familySeniorId, organisation_id: otherOrganisationId },
      ],
    });
    const {
      canAccessSenior,
      canAdministerSenior,
      requireAuthenticatedCaregiver,
    } = await import("./session");

    const result = await requireAuthenticatedCaregiver(request("token"));

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("expected auth success");
    expect(result.auth).toMatchObject({
      userId: "00000000-0000-4000-8000-000000000099",
      email: "judge@example.com",
      role: "demo_admin",
      caregiverId: "00000000-0000-4000-8000-000000000098",
      caregiverName: "Rachel Tan",
      organisationMemberships: [
        { organisationId, role: "org_admin" },
      ],
      accessibleSeniorIds: [seniorId, familySeniorId],
      administrableSeniorIds: [seniorId],
    });
    expect(result.accessToken).toBe("token");
    expect(result.auth).not.toHaveProperty("accessToken");
    expect(canAccessSenior(result.auth, familySeniorId)).toBe(true);
    expect(canAdministerSenior(result.auth, seniorId)).toBe(true);
    expect(canAdministerSenior(result.auth, familySeniorId)).toBe(false);
  });

  it("fails closed when RLS reads fail or return malformed roles", async () => {
    mockAuthenticatedLookups({ membershipError: { message: "private detail" } });
    const { requireAuthenticatedCaregiver } = await import("./session");
    const failedRead = await requireAuthenticatedCaregiver(request("token"));

    mockAuthenticatedLookups({
      memberships: [{ organisation_id: organisationId, role: "owner" }],
    });
    const malformedRole = await requireAuthenticatedCaregiver(request("token"));

    createUserClientMock.mockReturnValue({
      from: () => {
        throw new Error("private thrown detail");
      },
    });
    const thrownRead = await requireAuthenticatedCaregiver(request("token"));

    mockAuthenticatedLookups();
    serviceFromMock.mockImplementation(() => {
      throw new Error("private caregiver detail");
    });
    const thrownCaregiverRead = await requireAuthenticatedCaregiver(
      request("token")
    );

    mockAuthenticatedLookups();
    createUserClientMock.mockImplementation(() => {
      throw new Error("private client detail");
    });
    const thrownClientCreation = await requireAuthenticatedCaregiver(
      request("token")
    );

    expect(failedRead).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(malformedRole).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(thrownRead).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(thrownCaregiverRead).toEqual({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
    expect(thrownClientCreation).toEqual({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
    expect(
      JSON.stringify([
        failedRead,
        malformedRole,
        thrownRead,
        thrownCaregiverRead,
        thrownClientCreation,
      ])
    ).not.toContain("private detail");
  });

  it("keeps organisation administration separate from demo administration", async () => {
    mockAuthenticatedLookups({
      memberships: [{ organisation_id: organisationId, role: "org_admin" }],
      seniors: [{ id: seniorId, organisation_id: organisationId }],
    });
    const { requireDemoAdmin, requireOrganisationAdmin } = await import("./session");

    const organisationAdmin = await requireOrganisationAdmin(request("token"));
    const notDemoAdmin = await requireDemoAdmin(request("token"));

    mockAuthenticatedLookups({ appRole: "demo_admin" });
    const demoAdmin = await requireDemoAdmin(request("token"));
    const notOrganisationAdmin = await requireOrganisationAdmin(request("token"));

    expect(organisationAdmin).toMatchObject({ ok: true });
    expect(notDemoAdmin).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(demoAdmin).toMatchObject({ ok: true });
    expect(notOrganisationAdmin).toEqual({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
  });
});
