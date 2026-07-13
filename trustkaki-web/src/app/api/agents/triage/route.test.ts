import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("server-only", () => ({}));

const requireAuthMock = vi.fn();
const canAccessSeniorMock = vi.fn();
const loadContextMock = vi.fn();
const runTriageAgentMock = vi.fn();
const seniorId = "00000000-0000-4000-8000-000000000001";
const auth = { userId: "user-1", accessibleSeniorIds: [seniorId] };
const context = { senior: { name: "Mr Tan" }, messages: [], currentRiskLevel: "yellow" };

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthMock,
  canAccessSenior: canAccessSeniorMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadAuthorizedAgentContext: loadContextMock,
}));
vi.mock("@/lib/agents/orchestrator", () => ({ runTriageAgent: runTriageAgentMock }));
vi.mock("@/lib/agents/provider", () => ({
  getLLMProvider: () => ({ isConfigured: true, getModel: () => "test-model" }),
}));

const request = () => new Request("http://localhost/api/agents/triage", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ seniorId, message: "Not hungry today." }),
}) as NextRequest;

describe("/api/agents/triage", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ ok: true, auth, accessToken: "verified-access-token" });
    canAccessSeniorMock.mockReturnValue(true);
    loadContextMock.mockResolvedValue(context);
    runTriageAgentMock.mockResolvedValue({ data: { signals: [] } });
  });

  it("returns 401 before model work", async () => {
    requireAuthMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(401);
    expect(runTriageAgentMock).not.toHaveBeenCalled();
  });

  it("returns 403 before loading context or model work", async () => {
    canAccessSeniorMock.mockReturnValue(false);
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(403);
    expect(loadContextMock).not.toHaveBeenCalled();
    expect(runTriageAgentMock).not.toHaveBeenCalled();
  });

  it("runs against authorized server context without leaking the token", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());
    const json = await response.json();
    expect(loadContextMock).toHaveBeenCalledWith({ auth, seniorId });
    expect(runTriageAgentMock).toHaveBeenCalledWith("Not hungry today.", context);
    expect(JSON.stringify(json)).not.toContain("verified-access-token");
  });
});
