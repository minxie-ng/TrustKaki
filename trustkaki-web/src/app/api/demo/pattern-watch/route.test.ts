import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const orchestrateMock = vi.fn();
const persistOrchestrationResultMock = vi.fn();
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

vi.mock("@/lib/agents/orchestrator", () => ({
  orchestrate: orchestrateMock,
}));

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  persistOrchestrationResult: persistOrchestrationResultMock,
  readDashboardState: readDashboardStateMock,
  resetDemoPersistence: resetDemoPersistenceMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireDemoAdmin: requireDemoAdminMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

const originalFullReplay = process.env.ENABLE_FULL_AGENT_REPLAY;

describe("/api/demo/pattern-watch full replay", () => {
  beforeEach(() => {
    vi.resetModules();
    orchestrateMock.mockReset();
    persistOrchestrationResultMock.mockReset();
    readDashboardStateMock.mockReset();
    resetDemoPersistenceMock.mockReset();
    requireDemoAdminMock.mockReset();
    requireDemoAdminMock.mockResolvedValue({ ok: true, auth });
    vi.unstubAllEnvs();
    if (originalFullReplay === undefined) {
      delete process.env.ENABLE_FULL_AGENT_REPLAY;
    } else {
      process.env.ENABLE_FULL_AGENT_REPLAY = originalFullReplay;
    }
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    if (originalFullReplay === undefined) {
      delete process.env.ENABLE_FULL_AGENT_REPLAY;
    } else {
      process.env.ENABLE_FULL_AGENT_REPLAY = originalFullReplay;
    }
  });

  it("is disabled in production unless explicitly enabled", async () => {
    vi.stubEnv("NODE_ENV", "production");
    delete process.env.ENABLE_FULL_AGENT_REPLAY;
    const { POST, runtime } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/pattern-watch"));
    const json = await response.json();

    expect(runtime).toBe("nodejs");
    expect(response.status).toBe(404);
    expect(json.error).toBe("Full Agent Replay is not available");
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("can run when explicitly enabled", async () => {
    process.env.ENABLE_FULL_AGENT_REPLAY = "true";
    orchestrateMock.mockResolvedValue({
      policy: { finalRisk: "yellow" },
      signals: [{ type: "health" }],
    });
    readDashboardStateMock.mockResolvedValue({
      persistence: { mode: "supabase", configured: true, persisted: true },
      data: { followUpQueue: [] },
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/demo/pattern-watch"));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(orchestrateMock).toHaveBeenCalledTimes(4);
    expect(json.warning).toContain("Full Agent Replay may take over one minute");
  });
});
