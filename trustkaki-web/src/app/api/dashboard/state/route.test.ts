import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const readDashboardStateMock = vi.fn();
const requireAuthenticatedCaregiverMock = vi.fn();

const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "demo_admin",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: ["00000000-0000-0000-0000-000000000001"],
};

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  readDashboardState: readDashboardStateMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthenticatedCaregiverMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

beforeEach(() => {
  vi.resetModules();
  vi.unstubAllEnvs();
  readDashboardStateMock.mockReset();
  requireAuthenticatedCaregiverMock.mockReset();
  requireAuthenticatedCaregiverMock.mockResolvedValue({ ok: true, auth });
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("/api/dashboard/state", () => {
  it("requires an authenticated caregiver", async () => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/dashboard/state"));

    expect(response.status).toBe(401);
    expect(readDashboardStateMock).not.toHaveBeenCalled();
  });

  it("returns stored dashboard state for refresh hydration", async () => {
    const { GET } = await import("./route");
    readDashboardStateMock.mockResolvedValue({
      persistence: {
        mode: "supabase",
        configured: true,
        persisted: true,
      },
      data: {
        senior: {
          name: "Uncle Tan",
          age: 76,
          livingSituation: "Lives alone",
          caregiver: "Rachel Tan",
          aacVolunteer: "Mei Ling",
          riskLevel: "yellow",
          lastCheckIn: "2026-07-11T00:00:00.000Z",
        },
        activeSessions: [
          {
            id: "check_in_1",
            startedAt: "2026-07-11T00:00:00.000Z",
            status: "active",
            messages: [],
            traces: [],
            riskBefore: "green",
            riskAfter: "yellow",
            summary: "Stored summary",
          },
        ],
        recentAlerts: [],
      },
      briefing: null,
      traces: [],
    });

    const response = await GET(new Request("http://localhost/api/dashboard/state"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.persistence.persisted).toBe(true);
    expect(json.data.senior.riskLevel).toBe("yellow");
    expect(json.data.activeSessions[0].summary).toBe("Stored summary");
    expect(readDashboardStateMock).toHaveBeenCalledWith({ auth });
  });

  it("passes an optional selected senior id to dashboard state reads", async () => {
    const { GET } = await import("./route");
    readDashboardStateMock.mockResolvedValue({
      persistence: {
        mode: "supabase",
        configured: true,
        persisted: true,
      },
      data: {
        selectedSeniorId: "senior-2",
        seniors: [],
        senior: {
          name: "Aunty Lim",
          age: 81,
          livingSituation: "Lives with son",
          caregiver: "Daniel Lim",
          aacVolunteer: "Mei Ling",
          riskLevel: "green",
          lastCheckIn: null,
        },
        activeSessions: [],
        recentAlerts: [],
        followUpQueue: [],
      },
      briefing: null,
      traces: [],
    });

    const response = await GET(
      new Request("http://localhost/api/dashboard/state?seniorId=senior-2")
    );

    expect(response.status).toBe(200);
    expect(readDashboardStateMock).toHaveBeenCalledWith({
      auth,
      seniorId: "senior-2",
    });
  });

  it("sanitizes production errors from persistence failures", async () => {
    vi.stubEnv("NODE_ENV", "production");
    readDashboardStateMock.mockRejectedValue(
      new Error("Supabase failed with SUPABASE_SERVICE_ROLE_KEY and +6591234567")
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/dashboard/state"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json).toEqual({ error: "Failed to read dashboard state" });
    expect(JSON.stringify(json)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(JSON.stringify(json)).not.toContain("+6591234567");
  });

  it("returns 403 when the selected senior is not accessible", async () => {
    readDashboardStateMock.mockRejectedValue(new Error("Forbidden"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/dashboard/state?seniorId=senior-unauthorized")
    );
    const json = await response.json();

    expect(response.status).toBe(403);
    expect(json).toEqual({ error: "Forbidden" });
  });

  it("keeps development route errors useful but redacted", async () => {
    vi.stubEnv("NODE_ENV", "development");
    readDashboardStateMock.mockRejectedValue(
      new Error("Supabase failed with token abc123 and +6591234567")
    );
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/dashboard/state"));
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.error).toBe("Failed to read dashboard state");
    expect(json.detail).toContain("token [redacted]");
    expect(json.detail).toContain("[phone]");
  });
});
