import { describe, expect, it } from "vitest";
import type { MemoryCandidate, MemorySourceMessage } from "./contracts";
import {
  evaluateMemoryCandidate,
  expiryForRetention,
  normaliseContextKey,
} from "./policy";

const sourceMessage: MemorySourceMessage = {
  id: "message-1",
  sender: "senior",
  text: "Please keep messages short because long messages are hard to follow.",
};

const validPreference: MemoryCandidate = {
  targetStore: "memory",
  contextKey: "Preferred Message Style",
  contextType: "communication_preference",
  content: "Prefers short text messages.",
  sourceMessageId: sourceMessage.id,
  evidenceExcerpt: "Please keep messages short",
  confidence: 0.85,
  applicationTags: ["concise_text"],
  retentionClass: "preference",
};

describe("memory eligibility policy", () => {
  it("accepts a supported preference at the confidence threshold", () => {
    expect(evaluateMemoryCandidate(validPreference, sourceMessage)).toEqual({
      accepted: true,
      candidate: {
        ...validPreference,
        contextKey: "preferred_message_style",
        content: "Please keep messages short",
      },
      expiresInDays: 180,
    });
  });

  it("rejects a candidate below the confidence threshold", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, confidence: 0.84 },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "low_confidence" });
  });

  it("rejects evidence that is not an exact substring of the cited message", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, evidenceExcerpt: "keep messages concise" },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "unsupported_evidence" });
  });

  it("uses exact evidence instead of an unsupported generated paraphrase", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, content: "Prefers long voice calls." },
        sourceMessage
      )
    ).toMatchObject({
      accepted: true,
      candidate: { content: "Please keep messages short" },
    });
  });

  it("does not retain a hallucinated phone number from generated content", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, content: "Call +65 9000 0000 for reminders." },
        sourceMessage
      )
    ).toMatchObject({
      accepted: true,
      candidate: { content: "Please keep messages short" },
    });
  });

  it("rejects evidence excerpts too small to support durable context", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, evidenceExcerpt: "short" },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "unsupported_evidence" });
  });

  it("rejects whitespace-only evidence", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, evidenceExcerpt: " " },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "unsupported_evidence" });
  });

  it("rejects evidence from the wrong or a non-senior message", () => {
    expect(
      evaluateMemoryCandidate(validPreference, {
        ...sourceMessage,
        id: "message-2",
      })
    ).toEqual({ accepted: false, reason: "unsupported_evidence" });
    expect(
      evaluateMemoryCandidate(validPreference, {
        ...sourceMessage,
        sender: "trustkaki",
      })
    ).toEqual({ accepted: false, reason: "unsupported_evidence" });
  });

  it.each([
    "My OTP is 123456.",
    "My bank password is secret123.",
    "NRIC S1234567D",
    "Bank account 123-456",
    "Passport A1234567",
    "My PIN is 1234",
  ])("rejects sensitive data: %s", (text) => {
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          content: text,
          evidenceExcerpt: text,
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "sensitive_data" });
  });

  it("rejects diagnostic inference", () => {
    const text = "I think this means I probably have dementia.";
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          targetStore: "health_context",
          contextKey: "suspected_condition",
          contextType: "health_observation",
          content: "Probably has dementia.",
          evidenceExcerpt: text,
          applicationTags: ["gentle_one_to_one"],
          retentionClass: "health_accessibility",
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "diagnostic_inference" });
  });

  it("rejects common self-diagnostic wording", () => {
    const text = "I think I have Alzheimer's.";
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          targetStore: "health_context",
          contextKey: "suspected_condition",
          contextType: "health_observation",
          content: text,
          evidenceExcerpt: text,
          applicationTags: ["gentle_one_to_one"],
          retentionClass: "health_accessibility",
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "diagnostic_inference" });
  });

  it("rejects self-diagnostic claims without enumerating the condition", () => {
    const text = "I think I have hypertension";
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          targetStore: "health_context",
          contextKey: "suspected_condition",
          contextType: "health_observation",
          content: text,
          evidenceExcerpt: text,
          applicationTags: ["gentle_one_to_one"],
          retentionClass: "health_accessibility",
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "diagnostic_inference" });
  });

  it("rejects direct diagnostic claims without enumerating the condition", () => {
    const text = "I have hypertension";
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          targetStore: "health_context",
          contextKey: "lasting_health_context",
          contextType: "health_observation",
          content: text,
          evidenceExcerpt: text,
          applicationTags: ["gentle_one_to_one"],
          retentionClass: "health_accessibility",
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "diagnostic_inference" });
  });

  it("rejects common treatment instructions", () => {
    const text = "Take two aspirin daily";
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          targetStore: "health_context",
          contextKey: "aspirin_instruction",
          contextType: "health_observation",
          content: text,
          evidenceExcerpt: text,
          applicationTags: ["gentle_one_to_one"],
          retentionClass: "health_accessibility",
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "treatment_instruction" });
  });

  it("rejects treatment instructions without enumerating the medication", () => {
    const text = "Take metformin daily";
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          targetStore: "health_context",
          contextKey: "medication_instruction",
          contextType: "health_observation",
          content: text,
          evidenceExcerpt: text,
          applicationTags: ["gentle_one_to_one"],
          retentionClass: "health_accessibility",
        },
        { ...sourceMessage, text }
      )
    ).toEqual({ accepted: false, reason: "treatment_instruction" });
  });

  it("does not treat ordinary phrasing as a treatment instruction", () => {
    const foodMessage: MemorySourceMessage = {
      ...sourceMessage,
      text: "I take porridge daily and prefer it warm.",
    };
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          contextKey: "preferred_breakfast",
          contextType: "food_preference",
          content: "Prefers warm porridge.",
          evidenceExcerpt: foodMessage.text,
          applicationTags: ["practical_meal_prompt"],
        },
        foodMessage
      )
    ).toMatchObject({ accepted: true });

    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          content: "Uses the phrase take care.",
          evidenceExcerpt: "take care",
        },
        { ...sourceMessage, text: "Please keep messages short and take care." }
      )
    ).toMatchObject({ accepted: true });
  });

  it.each([
    ["NRIC S1234567D", "sensitive_data"],
    ["I think I have Alzheimer's", "diagnostic_inference"],
  ] as const)("scans the original context key: %s", (contextKey, reason) => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, contextKey },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason });
  });

  it("normalises stable context keys", () => {
    expect(normaliseContextKey("  Breakfast---Routine / Weekdays  ")).toBe(
      "breakfast_routine_weekdays"
    );
    expect(normaliseContextKey("___Preferred_LANGUAGE___")).toBe(
      "preferred_language"
    );
  });

  it.each([
    ["health_accessibility", "2026-08-15T00:00:00.000Z"],
    ["routine_baseline", "2026-10-14T00:00:00.000Z"],
    ["preference", "2027-01-12T00:00:00.000Z"],
    ["family_routing", "2027-01-12T00:00:00.000Z"],
  ] as const)("applies the %s retention default", (retentionClass, expected) => {
    expect(
      expiryForRetention(retentionClass, new Date("2026-07-16T00:00:00.000Z"))
    ).toBe(expected);
  });

  it("rejects unknown and incompatible application tags", () => {
    expect(
      evaluateMemoryCandidate(
        {
          ...validPreference,
          applicationTags: ["free_form_prompt"],
        } as unknown as MemoryCandidate,
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, applicationTags: ["trusted_contact_route"] },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
  });

  it("rejects incompatible context types and stores", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, targetStore: "routine_baseline" },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
  });

  it("rejects a retention class that does not match the context type", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, retentionClass: "health_accessibility" },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
  });

  it("rejects empty, oversized, or malformed candidate fields", () => {
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, contextKey: " ".repeat(10) },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, content: "x".repeat(501) },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
    expect(
      evaluateMemoryCandidate(
        { ...validPreference, applicationTags: [] },
        sourceMessage
      )
    ).toEqual({ accepted: false, reason: "invalid_candidate" });
  });
});
