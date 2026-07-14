import { describe, expect, it } from "vitest";
import type { MaskedContactPlan } from "@/lib/types";
import { contactPlanPresentation } from "./ContactPlanPanel";

const plan: MaskedContactPlan = {
  seniorId: "senior-1",
  contacts: [{
    id: "contact-1",
    displayName: "Rachel Tan",
    relationship: "Daughter",
    contactKind: "family_guardian",
    preferredLanguage: "en",
    timezone: "Asia/Singapore",
    escalationPriority: 1,
    active: true,
    updatedAt: "2026-07-14T00:00:00.000Z",
    methods: [{
      id: "method-1",
      channel: "whatsapp",
      maskedDestination: "•••• 4567",
      verificationStatus: "verified",
      verifiedAt: "2026-07-01T00:00:00.000Z",
      methodPriority: 1,
      quietHoursStart: "22:00",
      quietHoursEnd: "07:00",
      timezone: "Asia/Singapore",
      active: true,
      updatedAt: "2026-07-14T00:00:00.000Z",
      consent: {
        eventType: "granted",
        categories: ["health_safety", "urgent_safety"],
        allowUrgentQuietHours: true,
        confirmationMethod: "verbal",
        confirmedAt: "2026-07-01T00:00:00.000Z",
        expiresAt: null,
      },
    }],
  }],
};

describe("contact plan presentation", () => {
  it("keeps the caregiver summary concise and masked", () => {
    const view = contactPlanPresentation(plan, false);
    expect(view).toMatchObject({
      canEdit: false,
      primaryContact: "Rachel Tan · Daughter",
      primaryMethod: "WhatsApp · •••• 4567",
      availability: "Quiet hours 22:00–07:00 · urgent override allowed",
    });
    expect(JSON.stringify(view)).not.toContain("+658");
  });

  it("enables management only for admins", () => {
    expect(contactPlanPresentation(plan, true).canEdit).toBe(true);
    expect(contactPlanPresentation(plan, false).canEdit).toBe(false);
  });

  it("explains an empty contact plan", () => {
    expect(contactPlanPresentation({ seniorId: "senior-1", contacts: [] }, false)
      .primaryContact).toBe("No contact plan configured");
  });
});
