import { describe, expect, it } from "vitest";
import type {
  RecipientCandidate,
  RecipientSelectionInput,
} from "./contracts";
import { selectNotificationRecipient } from "./recipientSelection";

const evaluationTime = "2026-07-14T15:00:00.000Z"; // 23:00 in Singapore.

function input(
  overrides: Partial<RecipientSelectionInput> = {}
): RecipientSelectionInput {
  return {
    seniorId: "senior-1",
    category: "wellbeing_follow_up",
    destination: "family_guardian",
    evaluationTime,
    requestedChannel: null,
    ...overrides,
  };
}

function candidate(
  overrides: Partial<RecipientCandidate> = {}
): RecipientCandidate {
  return {
    contactId: "contact-1",
    methodId: "method-1",
    contactKind: "family_guardian",
    contactPriority: 1,
    contactActive: true,
    methodPriority: 1,
    methodActive: true,
    channel: "whatsapp",
    verificationStatus: "verified",
    verifiedAt: "2026-07-01T00:00:00.000Z",
    quietHoursStart: null,
    quietHoursEnd: null,
    timezone: "Asia/Singapore",
    consentEvents: [
      {
        id: "consent-1",
        eventType: "granted",
        categories: ["wellbeing_follow_up", "urgent_safety"],
        allowUrgentQuietHours: false,
        confirmedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
        createdAt: "2026-07-01T00:00:00.000Z",
      },
    ],
    ...overrides,
  };
}

describe("deterministic notification recipient selection", () => {
  it("uses contact priority, method priority, and stable IDs", () => {
    const result = selectNotificationRecipient(input(), [
      candidate({ contactId: "contact-b", methodId: "method-b" }),
      candidate({ contactId: "contact-a", methodId: "method-z" }),
      candidate({
        contactId: "contact-priority-two",
        methodId: "method-0",
        contactPriority: 2,
      }),
      candidate({ contactId: "contact-a", methodId: "method-a" }),
    ]);

    expect(result.result).toBe("candidate_selected");
    expect(result.selectedContactId).toBe("contact-a");
    expect(result.selectedMethodId).toBe("method-a");
  });

  it.each([
    ["inactive_contact", { contactActive: false }],
    ["inactive_method", { methodActive: false }],
    ["destination_mismatch", { contactKind: "aac_staff" as const }],
    ["unverified_method", { verificationStatus: "pending" as const }],
    ["unverified_method", { verifiedAt: null }],
  ])("excludes a candidate for %s", (reason, overrides) => {
    const result = selectNotificationRecipient(input(), [candidate(overrides)]);
    expect(result.result).toBe("no_eligible_contact");
    expect(result.candidates[0].reasonCodes).toContain(reason);
  });

  it("filters by requested channel when supplied", () => {
    const result = selectNotificationRecipient(
      input({ requestedChannel: "email" }),
      [candidate()]
    );
    expect(result.result).toBe("no_eligible_contact");
    expect(result.candidates[0].reasonCodes).toContain("channel_mismatch");
  });

  it("uses only the latest consent event", () => {
    const result = selectNotificationRecipient(input(), [
      candidate({
        consentEvents: [
          {
            id: "older-grant",
            eventType: "granted",
            categories: ["wellbeing_follow_up"],
            allowUrgentQuietHours: false,
            confirmedAt: "2026-07-01T00:00:00.000Z",
            expiresAt: null,
            createdAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "newer-revocation",
            eventType: "revoked",
            categories: [],
            allowUrgentQuietHours: false,
            confirmedAt: "2026-07-02T00:00:00.000Z",
            expiresAt: null,
            createdAt: "2026-07-02T00:00:00.000Z",
          },
        ],
      }),
    ]);
    expect(result.candidates[0].reasonCodes).toContain("consent_revoked");
  });

  it("does not revive an older grant when the latest grant expires", () => {
    const result = selectNotificationRecipient(input(), [
      candidate({
        consentEvents: [
          {
            id: "older-grant",
            eventType: "granted",
            categories: ["wellbeing_follow_up"],
            allowUrgentQuietHours: false,
            confirmedAt: "2026-07-01T00:00:00.000Z",
            expiresAt: null,
            createdAt: "2026-07-01T00:00:00.000Z",
          },
          {
            id: "expired-newer-grant",
            eventType: "granted",
            categories: ["wellbeing_follow_up"],
            allowUrgentQuietHours: false,
            confirmedAt: "2026-07-02T00:00:00.000Z",
            expiresAt: "2026-07-10T00:00:00.000Z",
            createdAt: "2026-07-02T00:00:00.000Z",
          },
        ],
      }),
    ]);
    expect(result.candidates[0].reasonCodes).toContain("consent_expired");
  });

  it("requires consent for the requested category", () => {
    const result = selectNotificationRecipient(
      input({ category: "digital_safety" }),
      [candidate()]
    );
    expect(result.candidates[0].reasonCodes).toContain("category_not_permitted");
  });

  it("handles overnight quiet hours", () => {
    const result = selectNotificationRecipient(input(), [
      candidate({ quietHoursStart: "22:00", quietHoursEnd: "07:00" }),
    ]);
    expect(result.candidates[0].reasonCodes).toContain("quiet_hours");
  });

  it("allows an urgent quiet-hours bypass only with explicit consent", () => {
    const urgent = input({ category: "urgent_safety" });
    const denied = selectNotificationRecipient(urgent, [
      candidate({ quietHoursStart: "22:00", quietHoursEnd: "07:00" }),
    ]);
    const allowedCandidate = candidate({
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      consentEvents: [
        {
          id: "urgent-consent",
          eventType: "granted",
          categories: ["urgent_safety"],
          allowUrgentQuietHours: true,
          confirmedAt: "2026-07-01T00:00:00.000Z",
          expiresAt: null,
          createdAt: "2026-07-01T00:00:00.000Z",
        },
      ],
    });
    const allowed = selectNotificationRecipient(urgent, [allowedCandidate]);

    expect(denied.result).toBe("no_eligible_contact");
    expect(denied.candidates[0].reasonCodes).toContain("quiet_hours");
    expect(allowed.result).toBe("candidate_selected");
  });

  it("never selects an automated recipient for emergency guidance", () => {
    const result = selectNotificationRecipient(
      input({ destination: "emergency_guidance", category: "urgent_safety" }),
      [candidate()]
    );
    expect(result.result).toBe("no_eligible_contact");
    expect(result.explanation).toContain("emergency services");
  });
});
