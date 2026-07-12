import { describe, expect, it } from "vitest";
import {
  agentMessageRequestSchema,
  queueActionRequestSchema,
  specialistAgentRequestSchema,
} from "./schemas";

const validContext = {
  senior: {
    name: "Uncle Tan",
    age: 76,
    livingSituation: "Lives alone",
    caregiver: "Rachel Tan",
    aacVolunteer: "Mei Ling",
  },
  messages: [
    {
      id: "m1",
      sender: "senior",
      text: "Hello",
      timestamp: "2026-07-12T00:00:00.000Z",
    },
  ],
  currentRiskLevel: "green",
};

describe("API request schemas", () => {
  it("accepts a bounded orchestration message request", () => {
    expect(
      agentMessageRequestSchema.safeParse({
        message: "Not hungry today",
        context: validContext,
      }).success
    ).toBe(true);
  });

  it("rejects oversized agent messages and oversized history", () => {
    expect(
      agentMessageRequestSchema.safeParse({
        message: "x".repeat(5001),
        context: validContext,
      }).success
    ).toBe(false);

    expect(
      agentMessageRequestSchema.safeParse({
        message: "ok",
        context: {
          ...validContext,
          messages: Array.from({ length: 51 }, (_, index) => ({
            id: `m${index}`,
            sender: "senior",
            text: "hello",
            timestamp: "2026-07-12T00:00:00.000Z",
          })),
        },
      }).success
    ).toBe(false);
  });

  it("validates queue actions and trims optional text bounds", () => {
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        actionType: "resolve",
      }).success
    ).toBe(true);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        actionType: "resolve",
        note: "x".repeat(501),
      }).success
    ).toBe(false);
  });

  it("validates specialist agent requests with optional triage signals", () => {
    expect(
      specialistAgentRequestSchema.safeParse({
        message: "Don't want. Paiseh.",
        context: validContext,
        triageSignals: [
          {
            type: "social",
            description: "Social hesitation",
            severity: "low",
          },
        ],
      }).success
    ).toBe(true);
  });
});
