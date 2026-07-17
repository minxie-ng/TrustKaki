import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const rpcMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiUserClient: () => ({ rpc: rpcMock }),
}));
import {
  ContactPlanForbiddenError,
  contactPlanCommands,
  mapRecipientResult,
  mapMaskedContactPlan,
  maskContactDestination,
} from "./contactPlanRepository";

describe("contact plan command authorization", () => {
  it("maps database authorization denial without exposing its message", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: "42501", message: "private database detail" },
    });

    const error = await contactPlanCommands
      .updateContact("token", {})
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ContactPlanForbiddenError);
    expect((error as Error).message).toBe("Forbidden");
    expect((error as Error).message).not.toContain("private database detail");
  });
});

describe("contact plan read model", () => {
  it.each([
    ["whatsapp", "+6581234567", "•••• 4567"],
    ["sms", "+6587654321", "•••• 4321"],
    ["email", "rachel@example.com", "r•••••@example.com"],
  ] as const)("masks %s destinations", (channel, raw, masked) => {
    expect(maskContactDestination(channel, raw)).toBe(masked);
  });

  it("returns latest consent without exposing a raw destination", () => {
    const plan = mapMaskedContactPlan({
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
          destination: "+6581234567",
          verificationStatus: "verified",
          verifiedAt: "2026-07-01T00:00:00.000Z",
          methodPriority: 1,
          quietHoursStart: "22:00",
          quietHoursEnd: "07:00",
          timezone: "Asia/Singapore",
          active: true,
          updatedAt: "2026-07-14T00:00:00.000Z",
          consentEvents: [
            {
              id: "older",
              eventType: "granted",
              categories: ["health_safety"],
              allowUrgentQuietHours: false,
              confirmationMethod: "verbal",
              confirmedAt: "2026-07-01T00:00:00.000Z",
              expiresAt: null,
              createdAt: "2026-07-01T00:00:00.000Z",
            },
            {
              id: "newer",
              eventType: "revoked",
              categories: [],
              allowUrgentQuietHours: false,
              confirmationMethod: "verbal",
              confirmedAt: "2026-07-02T00:00:00.000Z",
              expiresAt: null,
              createdAt: "2026-07-02T00:00:00.000Z",
            },
          ],
        }],
      }],
    });

    expect(plan.contacts[0].methods[0].maskedDestination).toBe("•••• 4567");
    expect(plan.contacts[0].methods[0].consent?.eventType).toBe("revoked");
    expect(JSON.stringify(plan)).not.toContain("+6581234567");
  });
});

describe("recipient preview read model", () => {
  it("preserves deterministic exclusion reasons returned by Supabase", () => {
    const result = mapRecipientResult({
      result: "no_eligible_contact",
      selected_contact_id: null,
      selected_method_id: null,
      explanation: "No eligible contact.",
      skipped_reasons: [{
        contact_id: "00000000-0000-4000-8000-000000000001",
        method_id: "00000000-0000-4000-8000-000000000002",
        reason_codes: ["quiet_hours", "category_not_permitted"],
      }],
    });

    expect(result.skippedReasons).toEqual([{
      contactId: "00000000-0000-4000-8000-000000000001",
      methodId: "00000000-0000-4000-8000-000000000002",
      reasonCodes: ["quiet_hours", "category_not_permitted"],
    }]);
  });
});
