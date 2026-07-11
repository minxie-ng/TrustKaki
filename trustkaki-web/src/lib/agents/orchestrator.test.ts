import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AACNudgeOutput,
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestratorOutput,
  TriageOutput,
} from "./contracts";
import type { AgentId } from "@/lib/types";

const runAgentMock = vi.fn();

vi.mock("./runner", () => ({
  runAgent: runAgentMock,
  toAgentTrace: (result: AgentRunResult<unknown>) => ({
    id: result.traceId,
    agentId: result.agentId,
    agentName: result.agentName,
    timestamp: result.timestamp,
    input: result.input,
    reasoning: result.reasoning,
    output: result.output,
    tags: result.tags,
    durationMs: result.durationMs,
    modelUsed: result.modelUsed,
    fallback: result.fallback,
    inputSummary: result.inputSummary,
    outputSummary: result.outputSummary,
    stateChanges: result.stateChanges,
    errorMessage: result.errorMessage ?? null,
  }),
}));

const context = (currentRiskLevel: AgentRunContext["currentRiskLevel"] = "green"): AgentRunContext => ({
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

function result<T>(
  agentId: AgentId,
  data: T,
  tags: string[] = ["llm_success"]
): AgentRunResult<T> {
  return {
    agentId,
    agentName: `${agentId} Agent`,
    traceId: `trace_${agentId}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: "2026-07-11T00:00:00.000Z",
    input: `${agentId} input`,
    reasoning: `${agentId} reasoning`,
    output: JSON.stringify(data),
    tags,
    data,
    durationMs: 1,
    modelUsed: "test-model",
    fallback: false,
    inputSummary: `${agentId} input summary`,
    outputSummary: `${agentId} output summary`,
    stateChanges: [],
    errorMessage: null,
  };
}

const orchestratorData = (
  agentsToRun: string[]
): OrchestratorOutput => ({
  agentsToRun,
  priority: Object.fromEntries(agentsToRun.map((agent) => [agent, "high"])),
  reasoning: "route selected",
});

const triageData = (
  overrides: Partial<TriageOutput> = {}
): TriageOutput => ({
  signals: [],
  riskLevel: "green",
  riskChange: "none",
  routing: [],
  summary: "No concern",
  responseMessage: "Good to hear.",
  humanFollowUpRequired: false,
  ...overrides,
});

const briefingData = (
  overrides: Partial<BriefingOutput> = {}
): BriefingOutput => ({
  forCaregiver: "Caregiver note",
  forAACVolunteer: "AAC note",
  overallRisk: "green",
  keyConcerns: [],
  recommendedActions: [],
  ...overrides,
});

beforeEach(() => {
  runAgentMock.mockReset();
});

describe("orchestrate", () => {
  it("returns policy result and synthetic policy trace for a benign message without automatic briefing", async () => {
    const { orchestrate } = await import("./orchestrator");

    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()));

    const response = await orchestrate("Good morning, I slept well.", context());

    expect(runAgentMock).toHaveBeenCalledTimes(2);
    expect(response.riskLevel).toBe("green");
    expect(response.briefing).toBeNull();
    expect(response.alerts).toEqual([]);
    expect(response.policy).toMatchObject({
      finalRisk: "green",
      briefingRequired: false,
    });
    expect(response.traces.find((trace) => trace.agentId === "policy")).toMatchObject({
      agentId: "policy",
      agentName: "Deterministic Policy",
      tags: expect.arrayContaining(["policy", "no_briefing"]),
    });
    expect(response.traces.find((trace) => trace.agentId === "pattern_watch")).toMatchObject({
      agentId: "pattern_watch",
      agentName: "Pattern Watch Engine",
    });
  });

  it("preserves AAC Nudge routing for low social signal without Digital Safety, briefing, or caregiver alert", async () => {
    const { orchestrate } = await import("./orchestrator");

    const triage = triageData({
      signals: [
        {
          type: "social",
          severity: "low",
          description: "Reluctant to join AAC activity",
        },
      ],
      routing: ["aac_nudge"],
      summary: "Social reluctance",
    });
    const aac: AACNudgeOutput = {
      nudgeMessage: "No pressure. Maybe kopi with Mei Ling another day?",
      approach: "low pressure",
      rationale: "Preserve autonomy",
      suggestedChannel: "whatsapp",
    };

    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triage))
      .mockResolvedValueOnce(result("aac_nudge", aac));

    const response = await orchestrate("Don't want. Paiseh.", context());

    const calledAgentIds = runAgentMock.mock.calls.map((call) => call[0].agentId);
    expect(calledAgentIds).toEqual([
      "orchestrator",
      "triage",
      "aac_nudge",
    ]);
    expect(calledAgentIds).not.toContain("digital_safety");
    expect(calledAgentIds).not.toContain("briefing");
    expect(response.alerts).toEqual([]);
    expect(response.briefing).toBeNull();
    expect(response.policy.briefingRequired).toBe(false);
    expect(response.messages.some((m) => m.agentId === "aac_nudge")).toBe(true);
  });

  it("keeps policy risk authoritative when briefing returns a conflicting overallRisk", async () => {
    const { orchestrate } = await import("./orchestrator");

    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(
        result(
          "triage",
          triageData({
            signals: [
              { type: "health", severity: "medium", description: "Knee pain" },
              {
                type: "daily_living",
                severity: "medium",
                description: "Skipped breakfast",
              },
            ],
            riskLevel: "green",
            riskChange: "none",
          })
        )
      )
      .mockResolvedValueOnce(result("briefing", briefingData({ overallRisk: "green" })));

    const response = await orchestrate("Not hungry today. Knee pain.", context());

    expect(response.riskLevel).toBe("yellow");
    expect(response.briefing?.overallRisk).toBe("yellow");
    expect(response.alerts).toHaveLength(1);
  });
});
