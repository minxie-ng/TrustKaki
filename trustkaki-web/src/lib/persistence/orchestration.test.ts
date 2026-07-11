import { describe, expect, it } from "vitest";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
} from "@/lib/agents/contracts";
import {
  buildManualBriefingPersistencePayload,
  buildOrchestrationPersistencePayload,
  dashboardSnapshotToData,
} from "./orchestration";

const context = (
  currentRiskLevel: AgentRunContext["currentRiskLevel"] = "green"
): AgentRunContext => ({
  senior: {
    name: "Uncle Tan",
    age: 76,
    livingSituation: "Lives alone",
    caregiver: "Rachel Tan",
    aacVolunteer: "Mei Ling",
  },
  messages: [
    {
      id: "client_msg_1",
      sender: "senior",
      text: "Not hungry today. Knee pain.",
      timestamp: "2026-07-11T00:00:00.000Z",
    },
  ],
  currentRiskLevel,
});

const briefing: BriefingOutput = {
  forCaregiver: "Please check Uncle Tan's knee pain and appetite.",
  forAACVolunteer: "Offer a low-pressure check-in.",
  overallRisk: "yellow",
  keyConcerns: ["Knee pain", "Skipped meal"],
  recommendedActions: ["Call today"],
};

const response = (
  overrides: Partial<OrchestrateResponse> = {}
): OrchestrateResponse => ({
  messages: [{ text: "I hear you. Have you had any water?", agentId: "triage" }],
  traces: [
    {
      id: "trace_triage",
      agentId: "triage",
      agentName: "Triage Agent",
      timestamp: "2026-07-11T00:00:01.000Z",
      input: "triage input",
      reasoning: "triage claimed green",
      output: JSON.stringify({
        riskLevel: "green",
        riskChange: "none",
      }),
      tags: ["llm_success"],
      durationMs: 12,
      modelUsed: "test-model",
      fallback: false,
    },
    {
      id: "trace_policy",
      agentId: "policy",
      agentName: "Deterministic Policy",
      timestamp: "2026-07-11T00:00:02.000Z",
      input: "{}",
      reasoning: "Medium health + medium daily_living signal -> at least Yellow",
      output: JSON.stringify({
        finalRisk: "yellow",
        riskChange: "increase",
      }),
      tags: ["policy", "briefing_required", "alert_created"],
      durationMs: 0,
      modelUsed: "deterministic",
      fallback: false,
    },
  ],
  alerts: [
    {
      type: "health",
      message: "Knee pain + skipped breakfast",
      severity: "medium",
      urgent: false,
      reason: "Multiple medium-severity signals",
    },
  ],
  riskLevel: "yellow",
  riskChange: "increase",
  signals: [
    { type: "health", severity: "medium", description: "Knee pain" },
    {
      type: "daily_living",
      severity: "medium",
      description: "Skipped breakfast",
    },
  ],
  policy: {
    finalRisk: "yellow",
    riskChange: "increase",
    briefingRequired: true,
    alerts: [
      {
        type: "health",
        message: "Knee pain + skipped breakfast",
        severity: "medium",
        urgent: false,
        reason: "Multiple medium-severity signals",
      },
    ],
    reasoning: ["Medium health + medium daily_living signal -> at least Yellow"],
  },
  briefing,
  ...overrides,
});

describe("orchestration persistence mapping", () => {
  it("maps final policy risk as the persisted risk event", () => {
    const payload = buildOrchestrationPersistencePayload(
      "Not hungry today. Knee pain.",
      context(),
      response()
    );

    expect(payload.riskEvent).toMatchObject({
      previousRisk: "green",
      finalRisk: "yellow",
      riskChange: "increase",
    });
    expect(payload.agentRuns.map((run) => run.agentId)).toContain("policy");
  });

  it("does not let raw triage risk overwrite policy risk", () => {
    const payload = buildOrchestrationPersistencePayload(
      "Not hungry today. Knee pain.",
      context(),
      response({ riskLevel: "yellow" })
    );

    const triageOutput = payload.agentRuns.find((run) => run.agentId === "triage")?.outputJson;

    expect(triageOutput).toMatchObject({ riskLevel: "green" });
    expect(payload.riskEvent.finalRisk).toBe("yellow");
  });

  it("persists only policy-approved alerts", () => {
    const payload = buildOrchestrationPersistencePayload(
      "Good morning, I slept well.",
      {
        ...context(),
        messages: [],
      },
      response({
        alerts: [],
        signals: [{ type: "social", severity: "low", description: "Mild reluctance" }],
        policy: {
          finalRisk: "green",
          riskChange: "none",
          briefingRequired: false,
          alerts: [],
          reasoning: ["Only one low-severity social signal"],
        },
        briefing: null,
      })
    );

    expect(payload.signals).toHaveLength(1);
    expect(payload.alerts).toEqual([]);
    expect(payload.brief).toBeNull();
  });

  it("marks automatic briefing trigger as policy", () => {
    const payload = buildOrchestrationPersistencePayload(
      "Not hungry today. Knee pain.",
      context(),
      response()
    );

    expect(payload.brief?.trigger).toBe("policy");
  });

  it("marks manual briefing trigger as manual_override without changing risk", () => {
    const result: AgentRunResult<BriefingOutput> = {
      agentId: "briefing",
      agentName: "Briefing Agent",
      traceId: "trace_manual",
      timestamp: "2026-07-11T00:00:00.000Z",
      input: "input",
      reasoning: "reasoning",
      output: JSON.stringify({ ...briefing, overallRisk: "red" }),
      tags: ["llm_success"],
      data: { ...briefing, overallRisk: "red" },
      durationMs: 4,
      modelUsed: "test-model",
      fallback: false,
      inputSummary: "manual briefing",
      outputSummary: "manual briefing generated",
      stateChanges: ["briefing:manual_override"],
      errorMessage: null,
    };

    const payload = buildManualBriefingPersistencePayload(
      context("green"),
      result,
      { ...briefing, overallRisk: "green" }
    );

    expect(payload.brief.trigger).toBe("manual_override");
    expect(payload.brief.briefing.overallRisk).toBe("green");
    expect(payload.agentRun.tags).toContain("manual_override");
  });

  it("uses the inbound client message id for duplicate protection", () => {
    const payload = buildOrchestrationPersistencePayload(
      "Not hungry today. Knee pain.",
      context(),
      response()
    );

    expect(payload.inboundMessage.clientMessageId).toBe("client_msg_1");
    expect(payload.outboundMessages[0].clientMessageId).toBe("out_trace_triage_0");
  });

  it("maps a persisted snapshot into dashboard state for refresh reads", () => {
    const mapped = dashboardSnapshotToData({
      senior: {
        name: "Uncle Tan",
        age: 76,
        livingSituation: "Lives alone",
        caregiver: "Rachel Tan",
        aacVolunteer: "Mei Ling",
        riskLevel: "yellow",
        lastCheckIn: "2026-07-11T00:00:00.000Z",
      },
      checkIn: {
        id: "check_in_1",
        startedAt: "2026-07-11T00:00:00.000Z",
        status: "active",
        riskBefore: "green",
        riskAfter: "yellow",
        summary: "Summary",
      },
      messages: [],
      traces: [],
      alerts: [],
      briefing,
    });

    expect(mapped.data.senior.riskLevel).toBe("yellow");
    expect(mapped.data.activeSessions[0].summary).toBe("Summary");
    expect(mapped.briefing).toEqual(briefing);
  });
});
