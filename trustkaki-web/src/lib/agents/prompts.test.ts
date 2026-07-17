import { describe, expect, it } from "vitest";
import type {
  AgentRunContext,
  OrchestrateResponse,
  OrchestrationResult,
} from "./contracts";
import {
  CONTEXT_MEMORY_PROMPT,
  contextMemoryUserPrompt,
  orchestratorUserPrompt,
} from "./prompts";
import {
  contextMemoryOutputSchema,
  orchestratorOutputSchema,
} from "./schemas";
import { contextMemoryFallback } from "./fallbacks";

describe("agent prompts", () => {
  it("keeps context memory candidates off the public response contract", () => {
    type PublicHasCandidates = "contextMemoryCandidates" extends keyof OrchestrateResponse
      ? true
      : false;
    type InternalHasCandidates = "contextMemoryCandidates" extends keyof OrchestrationResult
      ? true
      : false;
    const publicHasCandidates: PublicHasCandidates = false;
    const internalHasCandidates: InternalHasCandidates = true;

    expect(publicHasCandidates).toBe(false);
    expect(internalHasCandidates).toBe(true);
  });

  it("represents the bounded null-age sentinel as unknown", () => {
    const context: AgentRunContext = {
      senior: {
        name: "Senior B",
        age: 0,
        livingSituation: "Not recorded",
        caregiver: "Caregiver B",
        aacVolunteer: "Not assigned",
      },
      messages: [],
      currentRiskLevel: "green",
    };

    const prompt = orchestratorUserPrompt("Hello", context);

    expect(prompt).toContain("- Age: unknown");
    expect(prompt).not.toContain("- Age: 0");
  });

  it("renders bounded context in separate safe-use sections", () => {
    const context: AgentRunContext = {
      senior: {
        name: "Senior B",
        age: 78,
        livingSituation: "Lives alone",
        caregiver: "Caregiver B",
        aacVolunteer: "Volunteer B",
      },
      messages: [],
      currentRiskLevel: "green",
      knownContext: {
        items: [
          {
            type: "preference",
            content: "Prefers voice calls in Mandarin",
            safeUseNotes: "Use for communication style only.",
            applicationTags: ["voice_preferred"],
          },
          {
            type: "usual_routine",
            content: "Breakfast: Usually eats before 9am",
            safeUseNotes: null,
            applicationTags: ["practical_meal_prompt"],
          },
          {
            type: "observed_operational_context",
            content: "Knee discomfort can affect downstairs trips",
            safeUseNotes: "Use only for follow-up; this is not a diagnosis.",
            applicationTags: ["accessibility_support"],
          },
        ],
      },
    };

    const prompt = orchestratorUserPrompt("Hello", context);

    expect(prompt).toContain("Preferences:");
    expect(prompt).toContain("Prefers voice calls in Mandarin");
    expect(prompt).toContain("Usual routine:");
    expect(prompt).toContain("Breakfast: Usually eats before 9am");
    expect(prompt).toContain("Observed operational context:");
    expect(prompt).toContain("Knee discomfort can affect downstairs trips");
    expect(prompt).toMatch(/may be stale/i);
    expect(prompt).toMatch(/not diagnostic|not a diagnosis/i);
  });

  it("defines a proposal-only context memory prompt with safe exclusions", () => {
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/proposals? only/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/exact.*senior-authored.*evidence/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/diagnos/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/treatment|medication/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/credential/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/OTP/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/bank|identity/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/unsupported family routing/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/provider payload/i);
    expect(CONTEXT_MEMORY_PROMPT).toMatch(/chain-of-thought/i);
    expect(CONTEXT_MEMORY_PROMPT).toContain('{ "candidates": [] }');
  });

  it("includes the current message id and exact senior-authored text in the memory prompt", () => {
    const prompt = contextMemoryUserPrompt({
      message: {
        id: "message-voice-language",
        sender: "senior",
        text: "I prefer voice calls in Mandarin.",
      },
      recentMessages: [],
      activeContext: [],
    });

    expect(prompt).toContain("message-voice-language");
    expect(prompt).toContain("I prefer voice calls in Mandarin.");
  });

  it("accepts exact memory candidates and a safe empty result", () => {
    expect(contextMemoryOutputSchema.safeParse({ candidates: [] }).success).toBe(
      true
    );
    expect(
      contextMemoryOutputSchema.safeParse({
        candidates: [
          {
            targetStore: "memory",
            contextKey: "preferred_language",
            contextType: "communication_preference",
            content: "Prefers voice calls in Mandarin",
            sourceMessageId: "message-voice-language",
            evidenceExcerpt: "I prefer voice calls in Mandarin.",
            confidence: 0.96,
            applicationTags: ["voice_preferred"],
            retentionClass: "preference",
            intent: "replace",
          },
        ],
      }).success
    ).toBe(true);
    expect(contextMemoryFallback()).toEqual({ candidates: [] });
  });

  it.each([
    ["unknown candidate field", { rawProviderPayload: "hidden" }],
    ["open target store", { targetStore: "profile" }],
    ["open context type", { contextType: "diagnosis" }],
    ["open application tag", { applicationTags: ["free_text"] }],
    ["open retention class", { retentionClass: "forever" }],
    ["invalid confidence", { confidence: 1.1 }],
    ["open intent", { intent: "delete" }],
  ])("rejects %s", (_label, override) => {
    const candidate = {
      targetStore: "memory",
      contextKey: "preferred_language",
      contextType: "communication_preference",
      content: "Prefers voice calls in Mandarin",
      sourceMessageId: "message-voice-language",
      evidenceExcerpt: "I prefer voice calls in Mandarin.",
      confidence: 0.96,
      applicationTags: ["voice_preferred"],
      retentionClass: "preference",
      ...override,
    };

    expect(
      contextMemoryOutputSchema.safeParse({ candidates: [candidate] }).success
    ).toBe(false);
  });

  it("keeps the orchestrator execution plan to known specialists", () => {
    expect(
      orchestratorOutputSchema.safeParse({
        agentsToRun: ["triage", "context_memory"],
        priority: { triage: "high", context_memory: "medium" },
        reasoning: "Durable preference",
      }).success
    ).toBe(true);
    expect(
      orchestratorOutputSchema.safeParse({
        agentsToRun: ["triage", "unknown_specialist"],
        priority: { triage: "high" },
        reasoning: "Unknown route",
      }).success
    ).toBe(false);
  });
});
