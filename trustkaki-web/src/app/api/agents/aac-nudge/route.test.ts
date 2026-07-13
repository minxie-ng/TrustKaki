import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AgentRunContext } from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const requireAuthMock = vi.fn();
const canAccessSeniorMock = vi.fn();
const loadContextMock = vi.fn();
const runTriageAgentMock = vi.fn();
const runAACNudgeAgentMock = vi.fn();
const seniorId = "00000000-0000-4000-8000-000000000001";
const auth = { userId: "user-1", accessibleSeniorIds: [seniorId] };
const context: AgentRunContext = {
  senior: {
    name: "Mr Tan",
    age: 78,
    livingSituation: "Lives alone",
    caregiver: "Rachel Tan",
    aacVolunteer: "Mei Ling",
  },
  messages: [],
  currentRiskLevel: "yellow",
};
const signals = [{ type: "social", description: "Withdrawal", severity: "medium" }];

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthMock,
  canAccessSenior: canAccessSeniorMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));
vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadAuthorizedAgentContext: loadContextMock,
}));
vi.mock("@/lib/agents/orchestrator", () => ({
  runTriageAgent: runTriageAgentMock,
  runAACNudgeAgent: runAACNudgeAgentMock,
}));
vi.mock("@/lib/agents/provider", () => ({
  getLLMProvider: () => ({ isConfigured: true, getModel: () => "test-model" }),
}));

function request(extra: Record<string, unknown> = {}) {
  return new Request("http://localhost/api/agents/aac-nudge", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ seniorId, message: "Don't want. Paiseh.", ...extra }),
  }) as NextRequest;
}

describe("/api/agents/aac-nudge", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    requireAuthMock.mockResolvedValue({ ok: true, auth, accessToken: "verified-access-token" });
    canAccessSeniorMock.mockReturnValue(true);
    loadContextMock.mockResolvedValue(context);
    runTriageAgentMock.mockResolvedValue({ data: { signals } });
    runAACNudgeAgentMock.mockResolvedValue({ data: { nudgeMessage: "No pressure." } });
  });

  it("returns 401 before model work", async () => {
    requireAuthMock.mockResolvedValue({ ok: false, status: 401, error: "Unauthorized" });
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(401);
    expect(runTriageAgentMock).not.toHaveBeenCalled();
    expect(runAACNudgeAgentMock).not.toHaveBeenCalled();
  });

  it("returns 403 before loading context or model work", async () => {
    canAccessSeniorMock.mockReturnValue(false);
    const { POST } = await import("./route");
    expect((await POST(request())).status).toBe(403);
    expect(loadContextMock).not.toHaveBeenCalled();
    expect(runTriageAgentMock).not.toHaveBeenCalled();
    expect(runAACNudgeAgentMock).not.toHaveBeenCalled();
  });

  it("derives AAC signals from server-side triage without leaking the token", async () => {
    const { POST } = await import("./route");
    const response = await POST(request());
    const json = await response.json();
    expect(loadContextMock).toHaveBeenCalledWith({ auth, seniorId });
    expect(runTriageAgentMock).toHaveBeenCalledWith("Don't want. Paiseh.", context);
    expect(runAACNudgeAgentMock).toHaveBeenCalledWith(
      "Don't want. Paiseh.",
      context,
      signals
    );
    expect(JSON.stringify(json)).not.toContain("verified-access-token");
  });

  it("rejects browser-supplied triage signals", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({ triageSignals: signals }));
    expect(response.status).toBe(400);
    expect(runTriageAgentMock).not.toHaveBeenCalled();
  });
});
