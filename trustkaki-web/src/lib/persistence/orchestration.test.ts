import { describe, expect, it, vi } from "vitest";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
} from "@/lib/agents/contracts";
import {
  automaticContextCommandId,
  buildAutomaticMemoryCommands,
  buildManualBriefingPersistencePayload,
  buildOrchestrationPersistencePayload,
  dashboardSnapshotToData,
  orchestrationPersistenceCommandId,
  restoreOrchestrationRetryEnvelope,
  serializeOrchestrationRetryEnvelope,
} from "./orchestration";
import type { OrchestrationResult } from "@/lib/agents/contracts";
import type { MemoryCandidate } from "@/lib/memory/contracts";

vi.mock("server-only", () => ({}));

const seniorId = "00000000-0000-4000-8000-000000000002";
const clientMessageId = "message-b-1";

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
  const candidate = (
    overrides: Partial<MemoryCandidate> = {}
  ): MemoryCandidate => ({
    targetStore: "memory",
    contextKey: "Preferred Language",
    contextType: "communication_preference",
    content: "Prefers Mandarin voice calls",
    sourceMessageId: clientMessageId,
    evidenceExcerpt: "voice calls in Mandarin",
    confidence: 0.94,
    applicationTags: ["voice_preferred"],
    retentionClass: "preference",
    ...overrides,
  });

  const memoryResult = (candidates: MemoryCandidate[]): OrchestrationResult => {
    const value = response() as OrchestrationResult;
    Object.defineProperty(value, "contextMemoryCandidates", {
      value: candidates,
      enumerable: false,
    });
    return value;
  };

  it("keeps command IDs stable for identical store and candidate input", () => {
    const input = {
      seniorId,
      sourceMessageId: "00000000-0000-4000-8000-000000000207",
      targetStore: "memory" as const,
      contextKey: "preferred_language",
      intent: "create" as const,
    };

    const first = automaticContextCommandId(input);

    expect(automaticContextCommandId(input)).toBe(first);
    expect(first).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
  });

  it("does not collide when the same context key targets different stores", () => {
    const input = {
      seniorId,
      sourceMessageId: "00000000-0000-4000-8000-000000000207",
      contextKey: "daily_routine",
      intent: "create" as const,
    };

    expect(
      automaticContextCommandId({ ...input, targetStore: "memory" })
    ).not.toBe(
      automaticContextCommandId({ ...input, targetStore: "routine_baseline" })
    );
  });

  it("round trips a versioned private retry envelope without exposing candidates in the public response", () => {
    const internal = memoryResult([candidate()]);
    const envelope = serializeOrchestrationRetryEnvelope(internal);
    const roundTripped = JSON.parse(JSON.stringify(envelope));
    const restored = restoreOrchestrationRetryEnvelope(roundTripped);

    expect(roundTripped).toMatchObject({
      version: 1,
      publicResponse: expect.objectContaining({ riskLevel: "yellow" }),
      contextMemoryCandidates: [expect.objectContaining({ contextKey: "Preferred Language" })],
    });
    expect(roundTripped.publicResponse).not.toHaveProperty("contextMemoryCandidates");
    expect(restored.contextMemoryCandidates).toEqual([candidate()]);
    expect(JSON.parse(JSON.stringify(restored))).not.toHaveProperty(
      "contextMemoryCandidates"
    );
  });

  it("rejects malformed and legacy public-only retry payloads", () => {
    expect(() => restoreOrchestrationRetryEnvelope(response())).toThrow(
      "invalid orchestration retry envelope"
    );
    expect(() =>
      restoreOrchestrationRetryEnvelope({
        version: 1,
        publicResponse: response(),
        contextMemoryCandidates: [{ contextKey: "incomplete" }],
      })
    ).toThrow("invalid orchestration retry envelope");
  });

  it("derives a stable replay binding command from senior and client message IDs", () => {
    const input = { seniorId, clientMessageId };
    expect(orchestrationPersistenceCommandId(input)).toBe(
      orchestrationPersistenceCommandId(input)
    );
    expect(orchestrationPersistenceCommandId(input)).not.toBe(
      orchestrationPersistenceCommandId({ ...input, clientMessageId: "message-b-2" })
    );
  });

  it("uses the persisted inbound UUID for an accepted candidate command", () => {
    const sourceContext: AgentRunContext = {
      ...context(),
      messages: [
        ...context().messages,
        {
          id: clientMessageId,
          sender: "senior",
          text: "I prefer voice calls in Mandarin",
          timestamp: "2026-07-16T00:00:00.000Z",
        },
      ],
    };

    const commands = buildAutomaticMemoryCommands({
      seniorId,
      clientMessageId,
      persistedInboundId: "00000000-0000-4000-8000-000000000207",
      persistedInboundCreatedAt: "2026-07-16T00:00:00.000Z",
      context: sourceContext,
      result: memoryResult([candidate()]),
    });

    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      sourceMessageId: "00000000-0000-4000-8000-000000000207",
      payload: {
        decision: "accepted",
        context_key: "preferred_language",
        evidence_excerpt: "voice calls in Mandarin",
      },
    });
    expect(commands[0].commandId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("does not treat a public JSON round trip as an internal result with no commands", () => {
    const roundTripped = JSON.parse(
      JSON.stringify(memoryResult([candidate()]))
    ) as OrchestrateResponse;

    expect(() =>
      buildAutomaticMemoryCommands({
        seniorId,
        clientMessageId,
        persistedInboundId: "00000000-0000-4000-8000-000000000207",
        persistedInboundCreatedAt: "2026-07-16T00:00:00.000Z",
        context: context(),
        result: roundTripped as OrchestrationResult,
      })
    ).toThrow("validated internal orchestration result");
  });

  it.each([
    ["same intent", undefined, undefined],
    ["mixed intent", "confirm" as const, "replace" as const],
  ])(
    "rejects normalized duplicate candidate keys before building commands (%s)",
    (_label, firstIntent, secondIntent) => {
      expect(() =>
        buildAutomaticMemoryCommands({
          seniorId,
          clientMessageId,
          persistedInboundId: "00000000-0000-4000-8000-000000000207",
          persistedInboundCreatedAt: "2026-07-16T00:00:00.000Z",
          context: context(),
          result: memoryResult([
            candidate({ contextKey: "Preferred Language", intent: firstIntent }),
            candidate({ contextKey: " preferred-language ", intent: secondIntent }),
          ]),
        })
      ).toThrow("ambiguous context candidate key");
    }
  );

  it("turns policy rejection into only a bounded rejection command", () => {
    const sourceContext: AgentRunContext = {
      ...context(),
      messages: [{
        id: clientMessageId,
        sender: "senior",
        text: "I probably have dementia",
        timestamp: "2026-07-16T00:00:00.000Z",
      }],
    };

    const commands = buildAutomaticMemoryCommands({
      seniorId,
      clientMessageId,
      persistedInboundId: "00000000-0000-4000-8000-000000000207",
      persistedInboundCreatedAt: "2026-07-16T00:00:00.000Z",
      context: sourceContext,
      result: memoryResult([
        candidate({
          targetStore: "health_context",
          contextKey: "possible diagnosis",
          contextType: "health_observation",
          content: "Possible dementia",
          evidenceExcerpt: "probably have dementia",
          retentionClass: "health_accessibility",
          applicationTags: ["accessibility_support"],
        }),
      ]),
    });

    expect(commands[0].payload).toEqual({
      store: "health_context",
      context_key: "possible_diagnosis",
      decision: "rejected",
      intent: "create",
      rejection_reason: "diagnostic_inference",
    });
    expect(JSON.stringify(commands[0])).not.toContain("probably have dementia");
  });

  it("rejects a candidate whose source is not the current inbound message", () => {
    const commands = buildAutomaticMemoryCommands({
      seniorId,
      clientMessageId,
      persistedInboundId: "00000000-0000-4000-8000-000000000207",
      persistedInboundCreatedAt: "2026-07-16T00:00:00.000Z",
      context: context(),
      result: memoryResult([
        candidate({
          sourceMessageId: "client_msg_1",
          evidenceExcerpt: "Knee pain",
        }),
      ]),
    });

    expect(commands[0].payload).toMatchObject({
      decision: "rejected",
      rejection_reason: "unsupported_evidence",
    });
  });

  it("maps final policy risk as the persisted risk event", () => {
    const payload = buildOrchestrationPersistencePayload({
      seniorId,
      message: "Not hungry today. Knee pain.",
      clientMessageId,
      context: context(),
      result: response(),
    });

    expect(payload.riskEvent).toMatchObject({
      previousRisk: "green",
      finalRisk: "yellow",
      riskChange: "increase",
    });
    expect(payload.agentRuns.map((run) => run.agentId)).toContain("policy");
  });

  it("does not let raw triage risk overwrite policy risk", () => {
    const payload = buildOrchestrationPersistencePayload({
      seniorId,
      message: "Not hungry today. Knee pain.",
      clientMessageId,
      context: context(),
      result: response({ riskLevel: "yellow" }),
    });

    const triageOutput = payload.agentRuns.find((run) => run.agentId === "triage")?.outputJson;

    expect(triageOutput).toMatchObject({ riskLevel: "green" });
    expect(payload.riskEvent.finalRisk).toBe("yellow");
  });

  it("persists only policy-approved alerts", () => {
    const payload = buildOrchestrationPersistencePayload({
      seniorId,
      message: "Good morning, I slept well.",
      clientMessageId,
      context: {
        ...context(),
        messages: [],
      },
      result: response({
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
      }),
    });

    expect(payload.signals).toHaveLength(1);
    expect(payload.alerts).toEqual([]);
    expect(payload.brief).toBeNull();
  });

  it("marks automatic briefing trigger as policy", () => {
    const payload = buildOrchestrationPersistencePayload({
      seniorId,
      message: "Not hungry today. Knee pain.",
      clientMessageId,
      context: context(),
      result: response(),
    });

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

  it("uses the explicit senior and inbound client message ids", () => {
    const duplicateTextContext: AgentRunContext = {
      ...context(),
      messages: [
        ...context().messages,
        {
          id: "wrong-text-match",
          sender: "senior",
          text: "Not hungry today. Knee pain.",
          timestamp: "2026-07-11T00:01:00.000Z",
        },
      ],
    };
    const payload = buildOrchestrationPersistencePayload({
      seniorId,
      message: "Not hungry today. Knee pain.",
      clientMessageId,
      context: duplicateTextContext,
      result: response(),
    });

    expect(payload.seniorId).toBe(seniorId);
    expect(payload.inboundMessage.clientMessageId).toBe(clientMessageId);
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
