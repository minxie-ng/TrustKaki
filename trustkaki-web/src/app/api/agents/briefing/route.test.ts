import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";
import type { AgentRunContext, AgentRunResult, BriefingOutput } from "@/lib/agents/contracts";

const runBriefingAgentMock = vi.fn();
const persistManualBriefingResultMock = vi.fn();

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
  runBriefingAgentMock.mockReset();
  persistManualBriefingResultMock.mockReset();
  persistManualBriefingResultMock.mockResolvedValue({
    mode: "local_demo",
    configured: false,
    persisted: false,
  });
});

describe("/api/agents/briefing manual override", () => {
  it("rejects manual briefing requests without an explicit manual_override trigger", async () => {
    const { POST } = await import("./route");

    const response = await POST(jsonRequest({ context: context("green") }));
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
      jsonRequest({ context: context("green"), trigger: "manual_override" })
    );
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.trigger).toBe("manual_override");
    expect(json.data.overallRisk).toBe("green");
    expect(json.tags).toContain("manual_override");
    expect(json.reasoning).toContain("Manual override");
    expect(JSON.parse(json.output).overallRisk).toBe("green");
    expect(json.persistence.persisted).toBe(false);
    expect(persistManualBriefingResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({ currentRiskLevel: "green" }),
        briefing: expect.objectContaining({ overallRisk: "green" }),
      })
    );
  });
});
