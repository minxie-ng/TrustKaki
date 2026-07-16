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
