import { describe, expect, it } from "vitest";
import {
  agentMessageRequestSchema,
  contactConsentRequestSchema,
  contactMethodCreateRequestSchema,
  contactMethodUpdateRequestSchema,
  recipientPreviewRequestSchema,
  seniorContactCreateRequestSchema,
  manualBriefingRequestSchema,
  queueActionRequestSchema,
  proactiveCheckInScheduleRequestSchema,
  seniorContextActionRequestSchema,
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
  it("requires a bound context version and meaningful correction reason", () => {
    const valid = {
      action: "correct",
      commandId,
      contextId: "00000000-0000-4000-8000-000000000088",
      store: "memory",
      expectedUpdatedAt,
      reason: "Corrected after caregiver confirmation.",
      replacement: {
        contextKey: "preferred_language",
        memoryType: "communication_preference",
        content: "Prefers concise Mandarin messages",
        importance: 4,
        safeUseNotes: "Use for message style only.",
        applicationTags: ["concise_text"],
        expiresAt: null,
      },
    };

    expect(seniorContextActionRequestSchema.safeParse(valid).success).toBe(true);
    expect(
      seniorContextActionRequestSchema.safeParse({ ...valid, reason: "Too short" })
        .success
    ).toBe(false);
    expect(
      seniorContextActionRequestSchema.safeParse({
        ...valid,
        expectedUpdatedAt: "stale",
      }).success
    ).toBe(false);
    expect(
      seniorContextActionRequestSchema.safeParse({
        ...valid,
        replacement: { ...valid.replacement, confidence: 0.99 },
      }).success
    ).toBe(false);
  });

  it("accepts archive commands without replacement data", () => {
    expect(
      seniorContextActionRequestSchema.safeParse({
        action: "archive",
        commandId,
        contextId: "00000000-0000-4000-8000-000000000088",
        store: "health_context",
        expectedUpdatedAt,
        reason: "Archived after caregiver review.",
      }).success
    ).toBe(true);
  });

  it("validates proactive schedule commands and meaningful pause reasons", () => {
    const base = {
      commandId,
      action: "configure",
      platform: "telegram",
      localSendTime: "09:00",
      timezone: "Asia/Singapore",
      activeWeekdays: [1, 2, 3, 4, 5, 6, 7],
      initialResponseMinutes: 120,
      retryResponseMinutes: 60,
      initialMessageTemplate: "Good morning. How are you today?",
      retryMessageTemplate: "Just checking again. Reply when convenient.",
      reason: null,
    };

    expect(proactiveCheckInScheduleRequestSchema.safeParse(base).success).toBe(true);
    expect(proactiveCheckInScheduleRequestSchema.safeParse({
      ...base,
      action: "pause",
      reason: "Busy",
    }).success).toBe(false);
    expect(proactiveCheckInScheduleRequestSchema.safeParse({
      ...base,
      action: "pause",
      reason: "Temporarily paused while the senior is overseas.",
    }).success).toBe(true);
    expect(proactiveCheckInScheduleRequestSchema.safeParse({
      ...base,
      now: "2026-07-15T00:00:00.000Z",
    }).success).toBe(false);
  });
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

  it("requires a destination and audit reason for escalation", () => {
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "escalate",
        note: "Supervisor review is needed after two unsuccessful calls.",
      }).success
    ).toBe(false);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "escalate",
        escalationDestination: "aac_supervisor",
      }).success
    ).toBe(false);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "escalate",
        escalationDestination: "aac_supervisor",
        notificationCategory: "wellbeing_follow_up",
        note: "Supervisor review is needed after two unsuccessful calls.",
      }).success
    ).toBe(true);
    expect(
      queueActionRequestSchema.safeParse({
        queueItemId: "queue-1",
        commandId,
        expectedUpdatedAt,
        actionType: "escalate",
        escalationDestination: "family_guardian",
        note: "Family follow-up is needed after repeated missed calls.",
      }).success
    ).toBe(false);
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

  it("validates strict admin contact and method commands", () => {
    expect(seniorContactCreateRequestSchema.safeParse({
      commandId,
      displayName: "Rachel Tan",
      relationship: "Daughter",
      contactKind: "family_guardian",
      preferredLanguage: "en",
      timezone: "Asia/Singapore",
      escalationPriority: 1,
    }).success).toBe(true);
    expect(contactMethodCreateRequestSchema.safeParse({
      commandId,
      channel: "whatsapp",
      destination: "+6581234567",
      methodPriority: 1,
      timezone: "Asia/Singapore",
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      rawProviderResponse: {},
    }).success).toBe(false);
  });

  it("requires consistent verification and quiet-hour fields", () => {
    expect(contactMethodUpdateRequestSchema.safeParse({
      commandId,
      expectedUpdatedAt,
      channel: "whatsapp",
      destination: "+6581234567",
      verificationStatus: "verified",
      verificationMethod: "admin_confirmed",
      verifiedAt: expectedUpdatedAt,
      methodPriority: 1,
      timezone: "Asia/Singapore",
      quietHoursStart: "22:00",
      active: true,
    }).success).toBe(false);
  });

  it("normalizes destinations according to their channel", () => {
    const whatsapp = contactMethodCreateRequestSchema.parse({
      commandId,
      channel: "whatsapp",
      destination: "+65 8123-4567",
      methodPriority: 1,
      timezone: "Asia/Singapore",
    });
    const email = contactMethodCreateRequestSchema.parse({
      commandId,
      channel: "email",
      destination: " Rachel.Tan@Example.COM ",
      methodPriority: 1,
      timezone: "Asia/Singapore",
    });

    expect(whatsapp.destination).toBe("+6581234567");
    expect(email.destination).toBe("rachel.tan@example.com");
  });

  it("rejects destinations that are invalid for the selected channel", () => {
    const base = {
      commandId,
      methodPriority: 1,
      timezone: "Asia/Singapore",
    };

    expect(contactMethodCreateRequestSchema.safeParse({
      ...base,
      channel: "email",
      destination: "+6581234567",
    }).success).toBe(false);
    expect(contactMethodCreateRequestSchema.safeParse({
      ...base,
      channel: "sms",
      destination: "rachel@example.com",
    }).success).toBe(false);
    expect(contactMethodCreateRequestSchema.safeParse({
      ...base,
      channel: "voice",
      destination: "81234567",
    }).success).toBe(false);
  });

  it("validates auditable consent and urgent override", () => {
    expect(contactConsentRequestSchema.safeParse({
      commandId,
      eventType: "granted",
      categories: ["urgent_safety"],
      allowUrgentQuietHours: true,
      confirmationMethod: "verbal",
      confirmedAt: expectedUpdatedAt,
      note: "Confirmed directly with the family contact.",
    }).success).toBe(true);
    expect(contactConsentRequestSchema.safeParse({
      commandId,
      eventType: "granted",
      categories: ["health_safety"],
      allowUrgentQuietHours: true,
      confirmationMethod: "verbal",
      confirmedAt: expectedUpdatedAt,
    }).success).toBe(false);
  });

  it("validates deterministic recipient previews", () => {
    expect(recipientPreviewRequestSchema.safeParse({
      category: "health_safety",
      destination: "family_guardian",
      evaluationTime: expectedUpdatedAt,
      requestedChannel: "whatsapp",
    }).success).toBe(true);
  });
});
