import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const DEMO_SENIOR_ID = "00000000-0000-4000-8000-000000000001";

const persistQuickDemoTimelineResultMock = vi.fn();
const readDashboardStateMock = vi.fn();
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

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  persistQuickDemoTimelineResult: persistQuickDemoTimelineResultMock,
  readDashboardState: readDashboardStateMock,
}));
vi.mock("@/lib/persistence/demoRepository", () => ({
  resetDemoPersistence: resetDemoPersistenceMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireDemoAdmin: requireDemoAdminMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

describe("/api/demo/pattern-watch/quick", () => {
  beforeEach(() => {
    vi.resetModules();
    persistQuickDemoTimelineResultMock.mockReset();
    readDashboardStateMock.mockReset();
    resetDemoPersistenceMock.mockReset();
    requireDemoAdminMock.mockReset();
    requireDemoAdminMock.mockResolvedValue({ ok: true, auth, accessToken });

    resetDemoPersistenceMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    persistQuickDemoTimelineResultMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    readDashboardStateMock.mockResolvedValue({
      persistence: { mode: "supabase", configured: true, persisted: true },
      data: {
        followUpQueue: [],
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("requires demo_admin authorization", async () => {
    requireDemoAdminMock.mockResolvedValue({
      ok: false,
      status: 403,
      error: "Forbidden",
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/pattern-watch/quick"));

    expect(response.status).toBe(403);
  });

  it("does not hardcode a final pattern or queue result", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/pattern-watch/quick"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signalsDetected).toBe(4);
    expect(json.queueCount).toBe(0);
    expect(persistQuickDemoTimelineResultMock).toHaveBeenCalledWith(
      expect.objectContaining({ seniorId: DEMO_SENIOR_ID })
    );
    expect(resetDemoPersistenceMock).toHaveBeenCalledWith({ accessToken });
    expect(readDashboardStateMock).toHaveBeenCalledWith({
      auth,
      seniorId: DEMO_SENIOR_ID,
    });
  });

  it("uses a deterministic timeline fixture for fast judge preparation", async () => {
    const { POST } = await import("./route");

    const startedAt = Date.now();
    const response = await POST(new Request("http://localhost/api/demo/pattern-watch/quick"));
    const elapsed = Date.now() - startedAt;
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signalsDetected).toBe(4);
    expect(elapsed).toBeLessThan(100);
  });

  it("keeps the four-day scenario newer than preserved audit history", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T08:00:00.000Z"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/demo/pattern-watch/quick")
    );

    expect(response.status).toBe(200);
    expect(persistQuickDemoTimelineResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: "quick_pattern_demo_day_1",
            timestamp: "2026-07-26T08:00:00.000Z",
          }),
          expect.objectContaining({
            id: "quick_pattern_demo_day_4",
            timestamp: "2026-07-29T08:00:00.000Z",
          }),
        ]),
      })
    );
  });
});
