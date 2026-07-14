import { describe, expect, it } from "vitest";
import {
  agentMessageRequestSchema,
  manualBriefingRequestSchema,
  queueActionRequestSchema,
  specialistAgentRequestSchema,
} from "./schemas";

const seniorId = "00000000-0000-4000-8000-000000000001";
const commandId = "00000000-0000-4000-8000-000000000099";
const expectedUpdatedAt = "2026-07-14T02:00:00.000Z";

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
  it("accepts a senior-scoped orchestration message request", () => {
    expect(
      agentMessageRequestSchema.safeParse({
        seniorId,
        message: "Not hungry today",
        clientMessageId: "web-message-1",
      }).success
    ).toBe(true);
  });

  it("rejects invalid IDs and bounded message fields", () => {
    expect(
      agentMessageRequestSchema.safeParse({
        seniorId,
        message: "x".repeat(5001),
      }).success
    ).toBe(false);

    expect(
      agentMessageRequestSchema.safeParse({
        seniorId: "not-a-uuid",
        message: "ok",
      }).success
    ).toBe(false);

    expect(
      agentMessageRequestSchema.safeParse({
        seniorId,
        message: "ok",
        clientMessageId: "x".repeat(121),
      }).success
    ).toBe(false);
  });

  it("rejects browser-supplied authoritative context", () => {
    expect(
      agentMessageRequestSchema.safeParse({
        seniorId,
        message: "Hello",
        context: validContext,
      }).success
    ).toBe(false);
  });

  it("validates queue actions and trims optional text bounds", () => {
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "record_outcome",
        outcomeType: "needs_follow_up",
        note: "Rachel will call after work today.",
      }).success
    ).toBe(true);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "resolve",
        note: "x".repeat(501),
      }).success
    ).toBe(false);
  });

  it("requires an audit note when snoozing or resolving a queue case", () => {
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "snooze",
        snoozedUntil: "2026-07-14T10:00:00.000Z",
      }).success
    ).toBe(false);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "snooze",
        note: "Handling a Red case first; will call after medication round.",
        snoozedUntil: "2026-07-14T10:00:00.000Z",
      }).success
    ).toBe(true);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "resolve",
      }).success
    ).toBe(false);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "resolve",
        outcomeType: "reached_and_okay",
        note: "Rachel spoke to him. He ate lunch and does not need further support today.",
      }).success
    ).toBe(true);
  });

  it("requires command identity and the last-seen case version", () => {
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        actionType: "assign",
      }).success
    ).toBe(false);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId: "not-a-uuid",
        expectedUpdatedAt: "yesterday",
        actionType: "assign",
      }).success
    ).toBe(false);
  });

  it("uses the same strict bounded request for specialist agents", () => {
    expect(
      specialistAgentRequestSchema.safeParse({
        seniorId,
        message: "Don't want. Paiseh.",
      }).success
    ).toBe(true);

    expect(
      specialistAgentRequestSchema.safeParse({
        seniorId,
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
    ).toBe(false);
  });

  it("accepts only a senior-scoped manual override briefing", () => {
    expect(
      manualBriefingRequestSchema.safeParse({
        seniorId,
        trigger: "manual_override",
      }).success
    ).toBe(true);

    for (const extra of [
      { context: validContext },
      { triageResult: {} },
      { aacNudgeResult: {} },
      { digitalSafetyResult: {} },
    ]) {
      expect(
        manualBriefingRequestSchema.safeParse({
          seniorId,
          trigger: "manual_override",
          ...extra,
        }).success
      ).toBe(false);
    }
  });
});
