import { describe, expect, it } from "vitest";
import type { MaskedContactPlan } from "@/lib/types";
import {
  contactPlanInstanceKey,
  contactPlanPresentation,
  isValidWhatsAppDestination,
  nextContactPriority,
  nextMethodPriority,
  recipientPreviewPresentation,
} from "./ContactPlanPanel";

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

  it("explains why configured recipients were excluded", () => {
    expect(recipientPreviewPresentation({
      result: "no_eligible_contact",
      selectedContactId: null,
      selectedMethodId: null,
      explanation: "No eligible contact.",
      candidates: [],
      skippedReasons: [{
        contactId: "contact-1",
        methodId: "method-1",
        reasonCodes: ["quiet_hours", "category_not_permitted"],
      }],
    }, plan)).toBe(
      "Rachel Tan (WhatsApp · •••• 4567) was excluded: quiet hours are active; consent does not cover this alert."
    );
  });

  it("enables management only for admins", () => {
    expect(contactPlanPresentation(plan, true).canEdit).toBe(true);
    expect(contactPlanPresentation(plan, false).canEdit).toBe(false);
  });

  it("explains an empty contact plan", () => {
    expect(contactPlanPresentation({ seniorId: "senior-1", contacts: [] }, false)
      .primaryContact).toBe("No contact plan configured");
  });

  it("uses a different component instance for each selected senior", () => {
    expect(contactPlanInstanceKey("senior-1")).not.toBe(
      contactPlanInstanceKey("senior-2")
    );
  });

  it("accepts only international WhatsApp destinations", () => {
    expect(isValidWhatsAppDestination("+6581234567")).toBe(true);
    expect(isValidWhatsAppDestination("+65 8123 4567")).toBe(true);
    expect(isValidWhatsAppDestination("12345678")).toBe(false);
  });

  it("appends a new contact within its own escalation group", () => {
    expect(nextContactPriority(plan, "family_guardian")).toBe(2);
    expect(nextContactPriority(plan, "aac_staff")).toBe(1);
    expect(nextContactPriority({
      ...plan,
      contacts: [
        ...plan.contacts,
        { ...plan.contacts[0], id: "contact-2", escalationPriority: 3 },
      ],
    }, "family_guardian")).toBe(4);
  });

  it("assigns a new contact method the next available priority", () => {
    expect(nextMethodPriority(plan.contacts[0])).toBe(2);
  });
});
