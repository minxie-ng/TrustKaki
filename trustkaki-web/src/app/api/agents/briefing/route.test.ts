import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AgentRunContext, AgentRunResult, BriefingOutput } from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const runBriefingAgentMock = vi.fn();
const persistManualBriefingResultMock = vi.fn();
const requireAuthenticatedCaregiverMock = vi.fn();
const canAccessSeniorMock = vi.fn();
const loadAuthorizedAgentContextMock = vi.fn();

const seniorId = "00000000-0000-4000-8000-000000000001";

const auth = {
  userId: "auth-user-1",
  email: "judge@example.com",
  role: "demo_admin",
  caregiverId: "caregiver-1",
  caregiverName: "Rachel Tan",
  accessibleSeniorIds: [seniorId],
};

vi.mock("@/lib/agents/orchestrator", () => ({
  runBriefingAgent: runBriefingAgentMock,
}));

vi.mock("@/lib/agents/provider", () => ({
  getLLMProvider: () => ({
    isConfigured: true,
    getModel: () => "test-model",
  }),
}));

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  persistManualBriefingResult: persistManualBriefingResultMock,
}));

vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadAuthorizedAgentContext: loadAuthorizedAgentContextMock,
}));

vi.mock("@/lib/auth/session", () => ({
  requireAuthenticatedCaregiver: requireAuthenticatedCaregiverMock,
  canAccessSenior: canAccessSeniorMock,
  authJsonError: (result: { error: string; status: number }) =>
    Response.json({ error: result.error }, { status: result.status }),
}));

const context = (
  currentRiskLevel: AgentRunContext["currentRiskLevel"] = "green"
): AgentRunContext => ({
  senior: {
    name: "Uncle Tan",
    age: 76,
    livingSituation: "Lives alone",
    caregiver: "Rachel",
    aacVolunteer: "Mei Ling",
  },
  messages: [],
  currentRiskLevel,
});

const briefingResult = (
  data: BriefingOutput
): AgentRunResult<BriefingOutput> => ({
  agentId: "briefing",
  agentName: "Briefing Agent",
  traceId: "trace_briefing_test",
  timestamp: "2026-07-11T00:00:00.000Z",
  input: "briefing input",
  reasoning: "briefing reasoning",
  output: JSON.stringify(data),
  tags: ["llm_success"],
  data,
  durationMs: 1,
  modelUsed: "test-model",
  fallback: false,
  inputSummary: "manual briefing",
  outputSummary: "briefing generated",
  stateChanges: ["briefing:manual_override"],
  errorMessage: null,
});

function jsonRequest(body: unknown): NextRequest {
  return new Request("http://localhost/api/agents/briefing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as NextRequest;
}

beforeEach(() => {
  vi.resetModules();
  runBriefingAgentMock.mockReset();
  persistManualBriefingResultMock.mockReset();
  requireAuthenticatedCaregiverMock.mockReset();
  canAccessSeniorMock.mockReset();
  loadAuthorizedAgentContextMock.mockReset();
  requireAuthenticatedCaregiverMock.mockResolvedValue({
    ok: true,
    auth,
    accessToken: "verified-access-token",
  });
  canAccessSeniorMock.mockReturnValue(true);
  loadAuthorizedAgentContextMock.mockResolvedValue(context("green"));
  persistManualBriefingResultMock.mockResolvedValue({
    mode: "local_demo",
    configured: false,
    persisted: false,
  });
});

describe("/api/agents/briefing manual override", () => {
  it("returns 401 before loading context or running models", async () => {
    requireAuthenticatedCaregiverMock.mockResolvedValue({
      ok: false,
      status: 401,
      error: "Unauthorized",
    });
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({ seniorId, trigger: "manual_override" })
    );

    expect(response.status).toBe(401);
    expect(loadAuthorizedAgentContextMock).not.toHaveBeenCalled();
    expect(runBriefingAgentMock).not.toHaveBeenCalled();
  });

  it("returns 403 before model or persistence work", async () => {
    canAccessSeniorMock.mockReturnValue(false);
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({ seniorId, trigger: "manual_override" })
    );

    expect(response.status).toBe(403);
    expect(loadAuthorizedAgentContextMock).not.toHaveBeenCalled();
    expect(runBriefingAgentMock).not.toHaveBeenCalled();
    expect(persistManualBriefingResultMock).not.toHaveBeenCalled();
  });

  it("rejects browser-supplied context from manual briefing requests", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      jsonRequest({
        seniorId,
        trigger: "manual_override",
        context: context("green"),
      })
    );
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.error).toContain("manual_override");
    expect(runBriefingAgentMock).not.toHaveBeenCalled();
  });

  it("records manual_override and does not let briefing risk override current policy risk", async () => {
    const { POST } = await import("./route");
    runBriefingAgentMock.mockResolvedValue(
      briefingResult({
        forCaregiver: "Everything looks stable.",
        forAACVolunteer: "No follow-up needed.",
        overallRisk: "red",
        keyConcerns: [],
        recommendedActions: [],
      })
    );

    const response = await POST(
      jsonRequest({ seniorId, trigger: "manual_override" })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.trigger).toBe("manual_override");
    expect(json.data.overallRisk).toBe("green");
    expect(json.tags).toContain("manual_override");
    expect(json.reasoning).toContain("Manual override");
    expect(JSON.parse(json.output).overallRisk).toBe("green");
    expect(json.persistence.persisted).toBe(false);
    expect(loadAuthorizedAgentContextMock).toHaveBeenCalledWith({ auth, seniorId });
    expect(runBriefingAgentMock).toHaveBeenCalledWith(context("green"));
    expect(persistManualBriefingResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ currentRiskLevel: "green" }),
        briefing: expect.objectContaining({ overallRisk: "green" }),
      })
    );
    expect(JSON.stringify(json)).not.toContain("verified-access-token");
  });
});
