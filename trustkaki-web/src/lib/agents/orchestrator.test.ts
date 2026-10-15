import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  ContextMemoryOutput,
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
      .mockResolvedValueOnce(result("triage", triageData()));

    const response = await orchestrate("Good morning, I slept well.", context());

    expect(runAgentMock).toHaveBeenCalledTimes(1);
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

  it("handles social refusal in the primary reply without a router or AAC call", async () => {
    const { orchestrate } = await import("./orchestrator");
    const reply = "That's okay. We can leave activities for now.";
    runAgentMock.mockResolvedValueOnce(result("triage", triageData({
      signals: [{ type: "social", severity: "low", description: "Declines activity" }],
      routing: ["aac_nudge"], // Historical provider output must not add another call.
      responseMessage: reply,
    })));
    const response = await orchestrate("Don't want. Paiseh.", context());
    expect(runAgentMock.mock.calls.map(call => call[0].agentId)).toEqual(["triage"]);
    expect(response.messages).toEqual([{ text: reply, agentId: "triage" }]);
    expect(response.briefing).toBeNull();
    expect(response.alerts).toEqual([]);
  });

  it("keeps policy risk authoritative when briefing returns a conflicting overallRisk", async () => {
    const { orchestrate } = await import("./orchestrator");

    runAgentMock
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
    // Reject the conflicting draft, rather than overwriting only its risk field.
    expect(response.briefing?.forCaregiver).toMatch(/unavailable|unable/i);
    expect(response.traces.find(trace => trace.agentId === "briefing")?.fallback).toBe(true);
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
      .mockResolvedValueOnce(result("triage", triageData({ routing: ["context_memory"] })))
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
        .mockResolvedValueOnce(result("triage", triageData({ routing: ["digital_safety", "context_memory"] })))
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
        .mockResolvedValueOnce(result("triage", triageData()))
        .mockResolvedValueOnce(result("context_memory", memoryData()));

      await orchestrate(message, ctx);

      expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
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
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(result("context_memory", memoryData()));

    await orchestrate(message, ctx);

    expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
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
        .mockResolvedValueOnce(result("triage", triageData({ routing: ["context_memory"] })));

      const response = await orchestrate(message, context());

      expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
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
      .mockResolvedValueOnce(result("triage", triageData()))
      .mockResolvedValueOnce(result("context_memory", memoryData()));

    await orchestrate(message, ctx);

    expect(runAgentMock.mock.calls.map((call) => call[0].agentId)).toEqual([
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
      .mockResolvedValueOnce(result("triage", triageData({ routing: ["digital_safety", "context_memory"] })))
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
          ["digital_safety", "context_memory"].includes(agentId)
        )
    ).toEqual(["digital_safety", "context_memory"]);
    expect(response.messages).toEqual([
      { text: "Digital safety warning", agentId: "digital_safety" },
    ]);
    expect(response.contextMemoryCandidates).toEqual([candidate]);
  });
});

describe("consolidated safety and briefing boundaries", () => {
  const safetyData = {
    isScam: false, scamType: null, confidence: 0.2,
    warningMessage: "I cannot verify this. Please use a trusted official channel.",
    educationalNote: "Do not share private codes.",
  };

  it.each([
    ["See https://example.test/parcel", []],
    ["They asked me for my OTP", []],
    ["有人让我提供验证码。", []],
    ["Please check this message", [{ type: "digital_safety", severity: "low", description: "Suspicious sender" }]],
  ])("retains safety analysis when Triage omits its route: %s", async (message, signals) => {
    const { orchestrate } = await import("./orchestrator");
    runAgentMock.mockImplementation(async (options) => {
      if (options.agentId === "triage") return result("triage", triageData({ signals: signals as TriageOutput["signals"] }));
      if (options.agentId === "digital_safety") return result("digital_safety", safetyData);
      return result(options.agentId, options.fallback());
    });
    const response = await orchestrate(message, context());
    expect(runAgentMock.mock.calls.map(call => call[0].agentId)).toContain("digital_safety");
    expect(response.messages).toHaveLength(1);
  });

  it("allows a Triage-requested Mandarin memory statement past the exclusion gate", async () => {
    const { orchestrate } = await import("./orchestrator");
    runAgentMock.mockResolvedValueOnce(result("triage", triageData({ routing: ["context_memory"] })))
      .mockResolvedValueOnce(result("context_memory", memoryData()));
    await orchestrate("我一般选择比较安静的地方。", context());
    expect(runAgentMock.mock.calls.map(call => call[0].agentId)).toEqual(["triage", "context_memory"]);
  });

  it.each(["你好！", "谢谢你。", "我的密码是hunter2，我喜欢用电话。", "我的验证码是123456，我喜欢华语。"])(
    "blocks small talk or credentials even when Triage requests memory: %s", async message => {
      const { orchestrate } = await import("./orchestrator");
      runAgentMock.mockImplementation(async options => result(options.agentId,
        options.agentId === "triage" ? triageData({ routing: ["context_memory"] }) : options.fallback()));
      const response = await orchestrate(message, context());
      expect(runAgentMock.mock.calls.map(call => call[0].agentId)).not.toContain("context_memory");
      expect(response.contextMemoryCandidates).toEqual([]);
    });

  it("gives Briefing final policy risk, validated signals and unavailable assessment status", async () => {
    const { orchestrate } = await import("./orchestrator");
    runAgentMock.mockImplementation(async options => {
      if (options.agentId === "triage") return result("triage", triageData({
        signals: [{ type: "digital_safety", severity: "high", description: "Suspicious payment request" }],
        routing: ["digital_safety"],
      }));
      if (options.agentId === "digital_safety") return { ...result("digital_safety", options.fallback()), fallback: true };
      return result(options.agentId, options.fallback());
    });
    const response = await orchestrate("Please check this payment request", context());
    const prompt = runAgentMock.mock.calls.find(call => call[0].agentId === "briefing")![0].userPrompt;
    expect(prompt).toContain('"finalRisk":"yellow"');
    expect(prompt).toContain('"digitalSafetyStatus":"unavailable"');
    expect(prompt).toContain("Suspicious payment request");
    expect(prompt).not.toContain("No scam");
    expect(response.briefing?.overallRisk).toBe("yellow");
    expect(response.messages).toEqual([{ text: expect.stringMatching(/couldn't|cannot|unable/i), agentId: "digital_safety" }]);
    expect(response.messages[0].text).not.toMatch(/Rachel|Mei Ling/);
  });

  it("prefers one urgent health response over a social draft and scam warning", async () => {
    const { orchestrate } = await import("./orchestrator");
    runAgentMock.mockImplementation(async options => {
      if (options.agentId === "triage") return result("triage", triageData({
        responseMessage: "Maybe join an activity?", routing: ["aac_nudge", "digital_safety"],
        signals: [{ type: "health", severity: "high", description: "Chest pain" }],
      }));
      if (options.agentId === "digital_safety") return result("digital_safety", { ...safetyData, isScam: true });
      return result(options.agentId, options.fallback());
    });
    const response = await orchestrate("Chest pain and this suspicious link", context());
    expect(response.messages).toHaveLength(1);
    expect(response.messages[0].text).toMatch(/urgent|immediate/i);
    expect(response.messages[0].text).not.toContain("activity");
    expect(response.riskLevel).toBe("red");
  });

  it("keeps emergency guidance when only a high digital signal was extracted", async () => {
    const { orchestrate } = await import("./orchestrator");
    runAgentMock.mockImplementation(async options => {
      if (options.agentId === "triage") return result("triage", triageData({
        signals: [{ type: "digital_safety", severity: "high", description: "Scam request" }],
      }));
      if (options.agentId === "digital_safety") return result("digital_safety", { ...safetyData, isScam: true });
      return result(options.agentId, options.fallback());
    });
    const response = await orchestrate("I have chest pain and someone asked for my OTP", context());
    expect(response.riskLevel).toBe("red");
    expect(response.messages).toEqual([{ text: expect.stringMatching(/urgent|immediate/i), agentId: "policy" }]);
  });

  it("keeps Mandarin emergency guidance when replacing the primary draft", async () => {
    const { orchestrate } = await import("./orchestrator");
    runAgentMock.mockImplementation(async options => result(options.agentId,
      options.agentId === "triage" ? triageData({
        responseMessage: "请立即找人帮忙。",
        signals: [{ type: "health", severity: "high", description: "Chest pain" }],
      }) : options.fallback()));
    const response = await orchestrate("我胸口很痛。", context());
    expect(response.messages).toHaveLength(1);
    expect(response.messages[0].text).toMatch(/立即|紧急/);
  });

  it("uses truthful fallbacks without claiming saved memory, invitations or named contacts", async () => {
    const { orchestrate, runAACNudgeAgent, runDigitalSafetyAgent } = await import("./orchestrator");
    runAgentMock.mockImplementation(async options => ({ ...result(options.agentId, options.fallback()), fallback: true }));
    const response = await orchestrate("Hello", context());
    const aac = await runAACNudgeAgent("Hello", context(), []);
    const safety = await runDigitalSafetyAgent("Hello", context());
    expect(response.messages[0].text).not.toMatch(/note that down|saved|contacted/i);
    expect(aac.data.nudgeMessage).not.toMatch(/Mei Ling|asking about|miss you/);
    expect(safety.data.warningMessage).not.toContain("Rachel");
  });
});

describe("mayContainDurableContext", () => {
  it.each([
    "I prefer voice calls in Mandarin.",
    "我喜欢用华语通话。",
    "我每天早餐吃粥。",
    "我习惯晚上九点睡觉。",
    "请用大字体，我看不清小字。",
    "我比较喜欢一对一的活动。",
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

  it.each(["Okay thank you.", "Good morning", "Knee pain today.", "你好！", "谢谢你。", "今天膝盖痛。", "我的密码是 hunter2，我喜欢电话。", "我的验证码是123456。", "我的银行卡号是1234567890123456。", "🙂"])(
    "rejects a transient cue: %s",
    async (message) => {
      const { mayContainDurableContext } = await import("./orchestrator");

      expect(mayContainDurableContext(message)).toBe(false);
    }
  );
});
