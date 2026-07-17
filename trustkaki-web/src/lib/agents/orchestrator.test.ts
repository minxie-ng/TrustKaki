import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AACNudgeOutput,
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  ContextMemoryOutput,
  OrchestratorOutput,
  SpecialistAgentId,
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
  agentsToRun: SpecialistAgentId[]
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

const memoryData = (
  overrides: Partial<ContextMemoryOutput> = {}
): ContextMemoryOutput => ({
  candidates: [],
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

  it("invokes context memory through the shared runner for a durable communication preference", async () => {
    const { orchestrate } = await import("./orchestrator");
    const candidate = {
      targetStore: "memory" as const,
      contextKey: "preferred_language",
      contextType: "communication_preference" as const,
      content: "Prefers voice calls in Mandarin",
      sourceMessageId: "message-voice-language",
      evidenceExcerpt: "I prefer voice calls in Mandarin.",
      confidence: 0.96,
      applicationTags: ["voice_preferred" as const],
      retentionClass: "preference" as const,
    };

    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(
        result("context_memory", memoryData({ candidates: [candidate] }))
      );

    const ctx = context();
    ctx.messages.push({
      id: "message-voice-language",
      sender: "senior",
      text: "I prefer voice calls in Mandarin.",
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    const response = await orchestrate(
      "I prefer voice calls in Mandarin.",
      ctx
    );

    const contextCall = runAgentMock.mock.calls.find(
      (call) => call[0].agentId === "context_memory"
    )?.[0];
    expect(contextCall).toMatchObject({
      agentName: "Context Memory Agent",
      inputSummary: "Review one senior message for durable context proposals",
    });
    expect(contextCall.fallback()).toEqual({ candidates: [] });
    expect(response.traces.map((trace) => trace.agentId)).toContain(
      "context_memory"
    );
    expect(
      response.traces.find((trace) => trace.agentId === "context_memory")
        ?.outputSummary
    ).toBe(
      "1 context proposal(s) for deterministic review; categories: communication_preference"
    );
    expect(response.contextMemoryCandidates).toEqual([candidate]);
    expect(response.messages).toEqual([
      { text: "Good to hear.", agentId: "triage" },
    ]);
  });

  it("invokes context memory when the validated execution plan requests it", async () => {
    const { orchestrate } = await import("./orchestrator");

    runAgentMock
      .mockResolvedValueOnce(
        result(
          "orchestrator",
          orchestratorData(["triage", "context_memory"])
        )
      )
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(result("context_memory", memoryData()));

    await orchestrate("Please note this for later.", context());

    expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toContain(
      "context_memory"
    );
  });

  it("supplies bounded active store keys so repeated facts can confirm or replace", async () => {
    const { orchestrate } = await import("./orchestrator");
    const ctx = context();
    ctx.knownContext = {
      items: [
        {
          type: "preference",
          targetStore: "memory",
          contextKey: "preferred_language",
          content: "I prefer voice calls in Mandarin.",
          safeUseNotes: null,
          applicationTags: ["voice_preferred"],
        },
      ],
    };
    ctx.messages.push({
      id: "changed-language",
      sender: "senior",
      text: "I now prefer voice calls in English.",
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    const replacement = {
      targetStore: "memory" as const,
      contextKey: "preferred_language",
      contextType: "communication_preference" as const,
      content: "Prefers voice calls in English.",
      sourceMessageId: "changed-language",
      evidenceExcerpt: "I now prefer voice calls in English.",
      confidence: 0.95,
      applicationTags: ["voice_preferred" as const],
      retentionClass: "preference" as const,
      intent: "replace" as const,
    };
    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(
        result("context_memory", memoryData({ candidates: [replacement] }))
      );

    const response = await orchestrate("I now prefer voice calls in English.", ctx);

    const contextCall = runAgentMock.mock.calls.find(
      (call) => call[0].agentId === "context_memory"
    )?.[0];
    expect(contextCall?.userPrompt).toContain(
      'store=memory; key=preferred_language; summary="I prefer voice calls in Mandarin."'
    );
    expect(response.contextMemoryCandidates).toEqual([replacement]);
  });

  it.each([
    "Okay thank you.",
    "Hello!",
    "Knee pain today.",
    "Not hungry today. Knee pain.",
  ])("skips context memory for non-durable message: %s", async (message) => {
    const { orchestrate } = await import("./orchestrator");

    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()));

    const response = await orchestrate(message, context());

    expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).not.toContain(
      "context_memory"
    );
    expect(response.contextMemoryCandidates).toEqual([]);
  });

  it("redacts prohibited data from recent history before context memory receives it", async () => {
    const { orchestrate } = await import("./orchestrator");
    const ctx = context();
    ctx.messages.push(
      {
        id: "history-phone",
        sender: "senior",
        text: "My phone is +65 9123 4567; invalid reference 91-23-4567.",
        timestamp: "2026-07-15T00:00:00.000Z",
      },
      {
        id: "history-secrets",
        sender: "senior",
        text: "OTP 654321, PIN: 4321, password hunter2.",
        timestamp: "2026-07-15T01:00:00.000Z",
      },
      {
        id: "history-card-codes",
        sender: "senior",
        text: "CVV 123, CVC 456, security code 7890.",
        timestamp: "2026-07-15T01:30:00.000Z",
      },
      {
        id: "history-identity",
        sender: "senior",
        text: "Bank account 123-456-789 and NRIC S1234567A.",
        timestamp: "2026-07-15T02:00:00.000Z",
      },
      {
        id: "history-safe",
        sender: "senior",
        text: "I like porridge.",
        timestamp: "2026-07-15T03:00:00.000Z",
      },
      {
        id: "current-preference",
        sender: "senior",
        text: "I prefer voice calls in Mandarin.",
        timestamp: "2026-07-16T00:00:00.000Z",
      }
    );
    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(result("context_memory", memoryData()));

    await orchestrate("I prefer voice calls in Mandarin.", ctx);

    const specialistPrompt = runAgentMock.mock.calls.find(
      (call) => call[0].agentId === "context_memory"
    )?.[0].userPrompt as string;
    expect(specialistPrompt).toContain("[REDACTED_PROHIBITED_DATA]");
    expect(specialistPrompt).toContain("I like porridge.");
    expect(specialistPrompt).not.toMatch(
      /\+65 9123 4567|91-23-4567|654321|4321|hunter2|CVV 123|CVC 456|security code 7890|123-456-789|S1234567A/
    );
  });

  it.each([
    "My OTP is 654321.",
    "My password hunter2.",
    "My phone number is +65 9123 4567.",
    "My CVV is 123.",
    "CVC: 456.",
    "The security code = 7890.",
    "CVV 123.",
    "CVC 456.",
    "The security code 7890.",
    "I prefer voice calls after 91-23-4567.",
    "I prefer voice calls after 31-02-2026.",
    "I prefer voice calls after 2026-02-30.",
    "I prefer voice calls after 29-02-2025.",
  ])(
    "excludes prohibited current data while preserving triage and digital safety: %s",
    async (message) => {
      const { orchestrate } = await import("./orchestrator");
      runAgentMock
        .mockResolvedValueOnce(
          result(
            "orchestrator",
            orchestratorData(["triage", "digital_safety", "context_memory"])
          )
        )
        .mockResolvedValueOnce(result("triage", triageData()))
        .mockResolvedValueOnce(
          result("digital_safety", {
            isScam: false,
            scamType: null,
            confidence: 0.2,
            warningMessage: "Do not share private data.",
            educationalNote: "Keep private data private.",
          })
        );

      const response = await orchestrate(message, context());

      expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
        "orchestrator",
        "triage",
        "digital_safety",
      ]);
      expect(response.contextMemoryCandidates).toEqual([]);
    }
  );

  it.each(["16-07-2026", "2026-07-16", "16/07/2026"])(
    "does not treat a common date as a phone number: %s",
    async (date) => {
      const { orchestrate } = await import("./orchestrator");
      const message = `I prefer voice calls in Mandarin from ${date}.`;
      const ctx = context();
      ctx.messages.push({
        id: `dated-preference-${date}`,
        sender: "senior",
        text: message,
        timestamp: "2026-07-16T00:00:00.000Z",
      });
      runAgentMock
        .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
        .mockResolvedValueOnce(result("triage", triageData()))
        .mockResolvedValueOnce(result("context_memory", memoryData()));

      await orchestrate(message, ctx);

      expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
        "orchestrator",
        "triage",
        "context_memory",
      ]);
    }
  );

  it("does not treat a benign password reminder preference as a credential", async () => {
    const { orchestrate } = await import("./orchestrator");
    const message = "I prefer password reminders by voice call.";
    const ctx = context();
    ctx.messages.push({
      id: "password-reminder-preference",
      sender: "senior",
      text: message,
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(result("context_memory", memoryData()));

    await orchestrate(message, ctx);

    expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
      "orchestrator",
      "triage",
      "context_memory",
    ]);
  });

  it.each([
    "Okay thank you.",
    "Hello!",
    "Nice weather today.",
    "Hi there",
    "Hello Rachel",
    "Hey Mei Ling",
    "The weather is nice today",
    "Nice weather today, isn't it?",
    "Thank you so much",
  ])(
    "overrides an incorrect context-memory plan for excluded text: %s",
    async (message) => {
      const { orchestrate } = await import("./orchestrator");
      runAgentMock
        .mockResolvedValueOnce(
          result(
            "orchestrator",
            orchestratorData(["triage", "context_memory"])
          )
        )
        .mockResolvedValueOnce(result("triage", triageData()));

      const response = await orchestrate(message, context());

      expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
        "orchestrator",
        "triage",
      ]);
      expect(response.contextMemoryCandidates).toEqual([]);
    }
  );

  it("still invokes context memory when a greeting prefixes durable context", async () => {
    const { orchestrate } = await import("./orchestrator");
    const message = "Hi, I prefer voice calls in Mandarin";
    const ctx = context();
    ctx.messages.push({
      id: "greeting-preference",
      sender: "senior",
      text: message,
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(result("context_memory", memoryData()));

    await orchestrate(message, ctx);

    expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
      "orchestrator",
      "triage",
      "context_memory",
    ]);
  });

  it("keeps unscreened candidates internal and removes their content from traces", async () => {
    const { orchestrate } = await import("./orchestrator");
    const candidate = {
      targetStore: "health_context" as const,
      contextKey: "unsafe_provider_claim",
      contextType: "health_observation" as const,
      content: "Likely dementia; password is hunter2",
      sourceMessageId: "lasting-health",
      evidenceExcerpt: "My secret password is hunter2.",
      confidence: 0.99,
      applicationTags: ["accessibility_support" as const],
      retentionClass: "health_accessibility" as const,
    };
    const ctx = context();
    ctx.messages.push({
      id: "lasting-health",
      sender: "senior",
      text: "My knee pain has been ongoing for years.",
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    runAgentMock
      .mockResolvedValueOnce(result("orchestrator", orchestratorData(["triage"])))
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(
        result("context_memory", memoryData({ candidates: [candidate] }))
      );

    const response = await orchestrate(
      "My knee pain has been ongoing for years.",
      ctx
    );
    const publicResponse = { ...response };
    const contextTrace = response.traces.find(
      (trace) => trace.agentId === "context_memory"
    );

    expect(response.contextMemoryCandidates).toEqual([candidate]);
    expect(publicResponse).not.toHaveProperty("contextMemoryCandidates");
    expect(JSON.parse(JSON.stringify(response))).not.toHaveProperty(
      "contextMemoryCandidates"
    );
    expect(contextTrace?.outputSummary).toBe(
      "1 context proposal(s) for deterministic review; categories: health_observation"
    );
    expect(JSON.parse(contextTrace?.output ?? "{}")).toEqual({
      candidateCount: 1,
      categories: ["health_observation"],
    });
    expect(JSON.stringify(contextTrace)).not.toMatch(
      /hunter2|dementia|secret password|unsafe_provider_claim|evidenceExcerpt|sourceMessageId/
    );
  });

  it("orders concurrent specialist effects independently of completion timing", async () => {
    const { orchestrate } = await import("./orchestrator");
    const message = "I prefer voice calls in Mandarin.";
    const ctx = context();
    ctx.messages.push({
      id: "ordered-specialists",
      sender: "senior",
      text: message,
      timestamp: "2026-07-16T00:00:00.000Z",
    });
    const candidate = {
      targetStore: "memory" as const,
      contextKey: "preferred_language",
      contextType: "communication_preference" as const,
      content: "Prefers voice calls in Mandarin",
      sourceMessageId: "ordered-specialists",
      evidenceExcerpt: message,
      confidence: 0.95,
      applicationTags: ["voice_preferred" as const],
      retentionClass: "preference" as const,
    };
    const delayed = <T,>(value: T, delayMs: number): Promise<T> =>
      new Promise((resolve) => setTimeout(() => resolve(value), delayMs));

    runAgentMock
      .mockResolvedValueOnce(
        result(
          "orchestrator",
          orchestratorData([
            "triage",
            "aac_nudge",
            "digital_safety",
            "context_memory",
          ])
        )
      )
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockImplementationOnce(() =>
        delayed(
          result("aac_nudge", {
            nudgeMessage: "AAC nudge",
            approach: "gentle",
            rationale: "support connection",
            suggestedChannel: "whatsapp" as const,
          }),
          30
        )
      )
      .mockImplementationOnce(() =>
        delayed(
          result("digital_safety", {
            isScam: true,
            scamType: "credential_request",
            confidence: 0.95,
            warningMessage: "Digital safety warning",
            educationalNote: "Do not share codes.",
          }),
          5
        )
      )
      .mockImplementationOnce(() =>
        delayed(
          result("context_memory", memoryData({ candidates: [candidate] })),
          15
        )
      )
      .mockResolvedValueOnce(result("briefing", briefingData()));

    const response = await orchestrate(message, ctx);

    expect(
      response.traces
        .map((trace) => trace.agentId)
        .filter((agentId) =>
          ["aac_nudge", "digital_safety", "context_memory"].includes(agentId)
        )
    ).toEqual(["aac_nudge", "digital_safety", "context_memory"]);
    expect(response.messages).toEqual([
      { text: "Good to hear.", agentId: "triage" },
      { text: "AAC nudge", agentId: "aac_nudge" },
      { text: "Digital safety warning", agentId: "digital_safety" },
    ]);
    expect(response.contextMemoryCandidates).toEqual([candidate]);
  });
});

describe("mayContainDurableContext", () => {
  it.each([
    "I prefer voice calls in Mandarin.",
    "I am vegetarian.",
    "I always eat porridge for breakfast.",
    "I prefer one-to-one AAC visits.",
    "Please use large text because I cannot read small words.",
    "Call my daughter Rachel first for appointments.",
    "My daughter Rachel handles my appointments.",
    "My knee pain has been ongoing for years.",
  ])("recognizes a durable cue: %s", async (message) => {
    const { mayContainDurableContext } = await import("./orchestrator");

    expect(mayContainDurableContext(message)).toBe(true);
  });

  it.each(["Okay thank you.", "Good morning", "Knee pain today."])(
    "rejects a transient cue: %s",
    async (message) => {
      const { mayContainDurableContext } = await import("./orchestrator");

      expect(mayContainDurableContext(message)).toBe(false);
    }
  );
});
