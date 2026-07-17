import "server-only";

import { z } from "zod";
import type {
  ContactChannel,
  NotificationCategory,
  NotificationDestination,
  RecipientSelectionResult,
} from "@/lib/contacts/contracts";
import type { MaskedContactPlan } from "@/lib/types";
import {
  createTrustKakiServiceClient,
  createTrustKakiUserClient,
} from "@/lib/supabase/server";

interface RawConsent {
  id: string;
  eventType: "granted" | "revoked";
  categories: NotificationCategory[];
  allowUrgentQuietHours: boolean;
  confirmationMethod: string;
  confirmedAt: string;
  expiresAt: string | null;
  createdAt: string;
}

interface RawMethod {
  id: string;
  channel: ContactChannel;
  destination: string;
  verificationStatus: "pending" | "verified" | "rejected";
  verifiedAt: string | null;
  methodPriority: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  active: boolean;
  updatedAt: string;
  consentEvents: RawConsent[];
}

interface RawContactPlan {
  seniorId: string;
  contacts: Array<{
    id: string;
    displayName: string;
    relationship: string;
    contactKind: "family_guardian" | "aac_staff" | "healthcare_contact";
    preferredLanguage: string;
    timezone: string;
    escalationPriority: number;
    active: boolean;
    updatedAt: string;
    methods: RawMethod[];
  }>;
}

function latestConsent(events: RawConsent[]): RawConsent | null {
  return [...events].sort((left, right) =>
    right.confirmedAt.localeCompare(left.confirmedAt) ||
    right.createdAt.localeCompare(left.createdAt) ||
    right.id.localeCompare(left.id)
  )[0] ?? null;
}

export function maskContactDestination(
  channel: ContactChannel,
  destination: string
): string {
  if (channel === "email") {
    const [local, domain] = destination.split("@");
    if (!domain) return "••••";
    return `${local.slice(0, 1)}${"•".repeat(Math.max(4, local.length - 1))}@${domain}`;
  }
  const visible = destination.replace(/\D/g, "").slice(-4);
  return visible ? `•••• ${visible}` : "••••";
}

export function mapMaskedContactPlan(raw: RawContactPlan): MaskedContactPlan {
  return {
    seniorId: raw.seniorId,
    contacts: raw.contacts.map((contact) => ({
      id: contact.id,
      displayName: contact.displayName,
      relationship: contact.relationship,
      contactKind: contact.contactKind,
      preferredLanguage: contact.preferredLanguage,
      timezone: contact.timezone,
      escalationPriority: contact.escalationPriority,
      active: contact.active,
      updatedAt: contact.updatedAt,
      methods: contact.methods.map((method) => {
        const consent = latestConsent(method.consentEvents);
        return {
          id: method.id,
          channel: method.channel,
          maskedDestination: maskContactDestination(method.channel, method.destination),
          verificationStatus: method.verificationStatus,
          verifiedAt: method.verifiedAt,
          methodPriority: method.methodPriority,
          quietHoursStart: method.quietHoursStart,
          quietHoursEnd: method.quietHoursEnd,
          timezone: method.timezone,
          active: method.active,
          updatedAt: method.updatedAt,
          consent: consent ? {
            eventType: consent.eventType,
            categories: consent.categories,
            allowUrgentQuietHours: consent.allowUrgentQuietHours,
            confirmationMethod: consent.confirmationMethod,
            confirmedAt: consent.confirmedAt,
            expiresAt: consent.expiresAt,
          } : null,
        };
      }),
    })),
  };
}

export class ContactPlanConflictError extends Error {
  constructor() {
    super("Contact plan changed");
    this.name = "ContactPlanConflictError";
  }
}

export class ContactPlanForbiddenError extends Error {
  constructor() {
    super("Forbidden");
    this.name = "ContactPlanForbiddenError";
  }
}

const commandResultSchema = z.object({
  id: z.string().uuid(),
  updated_at: z.string().optional(),
  created_at: z.string().optional(),
  duplicate: z.boolean(),
});

const recipientResultSchema = z.object({
  result: z.enum(["candidate_selected", "no_eligible_contact"]),
  selected_contact_id: z.string().uuid().nullable(),
  selected_method_id: z.string().uuid().nullable(),
  explanation: z.string(),
  skipped_reasons: z.array(z.object({
    contact_id: z.string().uuid(),
    method_id: z.string().uuid(),
    reason_codes: z.array(z.enum([
      "inactive_contact",
      "inactive_method",
      "destination_mismatch",
      "channel_mismatch",
      "unverified_method",
      "consent_missing",
      "consent_revoked",
      "consent_expired",
      "category_not_permitted",
      "quiet_hours",
    ])),
  })),
});

export function mapRecipientResult(value: unknown): RecipientSelectionResult {
  const parsed = recipientResultSchema.parse(value);
  return {
    result: parsed.result,
    selectedContactId: parsed.selected_contact_id,
    selectedMethodId: parsed.selected_method_id,
    explanation: parsed.explanation,
    candidates: [],
    skippedReasons: parsed.skipped_reasons.map((reason) => ({
      contactId: reason.contact_id,
      methodId: reason.method_id,
      reasonCodes: reason.reason_codes,
    })),
  };
}

async function rpcCommand(
  accessToken: string,
  name: string,
  payload: Record<string, unknown>
) {
  const client = createTrustKakiUserClient(accessToken);
  if (!client) throw new Error("Contact plan persistence unavailable");
  const { data, error } = await (client as unknown as {
    rpc: (rpcName: string, args: Record<string, unknown>) => Promise<{
      data: unknown; error: { code?: string } | null;
    }>;
  }).rpc(name, payload);
  if (error?.code === "42501") throw new ContactPlanForbiddenError();
  if (error?.code === "PT409") throw new ContactPlanConflictError();
  if (error) throw new Error("Contact plan command failed");
  return commandResultSchema.parse(data);
}

export async function readMaskedContactPlan(args: {
  seniorId: string;
}): Promise<MaskedContactPlan> {
  const client = createTrustKakiServiceClient();
  if (!client) return { seniorId: args.seniorId, contacts: [] };
  const { data, error } = await client
    .from("senior_contacts")
    .select("*, contact_methods(*, contact_consent_events(*))")
    .eq("senior_id", args.seniorId)
    .order("escalation_priority");
  if (error) throw new Error("Contact plan read failed");
  const contacts = (data ?? []) as unknown as Array<Record<string, unknown>>;
  return mapMaskedContactPlan({
    seniorId: args.seniorId,
    contacts: contacts.map((row) => ({
      id: String(row.id),
      displayName: String(row.display_name),
      relationship: String(row.relationship),
      contactKind: row.contact_kind as RawContactPlan["contacts"][number]["contactKind"],
      preferredLanguage: String(row.preferred_language),
      timezone: String(row.timezone),
      escalationPriority: Number(row.escalation_priority),
      active: Boolean(row.active),
      updatedAt: String(row.updated_at),
      methods: ((row.contact_methods ?? []) as Array<Record<string, unknown>>).map((method) => ({
        id: String(method.id),
        channel: method.channel as ContactChannel,
        destination: String(method.destination_normalized),
        verificationStatus: method.verification_status as RawMethod["verificationStatus"],
        verifiedAt: method.verified_at ? String(method.verified_at) : null,
        methodPriority: Number(method.method_priority),
        quietHoursStart: method.quiet_hours_start ? String(method.quiet_hours_start).slice(0, 5) : null,
        quietHoursEnd: method.quiet_hours_end ? String(method.quiet_hours_end).slice(0, 5) : null,
        timezone: String(method.timezone),
        active: Boolean(method.active),
        updatedAt: String(method.updated_at),
        consentEvents: ((method.contact_consent_events ?? []) as Array<Record<string, unknown>>).map((event) => ({
          id: String(event.id),
          eventType: event.event_type as RawConsent["eventType"],
          categories: event.permitted_categories as NotificationCategory[],
          allowUrgentQuietHours: Boolean(event.allow_urgent_quiet_hours),
          confirmationMethod: String(event.confirmation_method),
          confirmedAt: String(event.confirmed_at),
          expiresAt: event.expires_at ? String(event.expires_at) : null,
          createdAt: String(event.created_at),
        })),
      })),
    })),
  });
}

export const contactPlanCommands = {
  createContact: (accessToken: string, payload: Record<string, unknown>) =>
    rpcCommand(accessToken, "create_senior_contact", payload),
  updateContact: (accessToken: string, payload: Record<string, unknown>) =>
    rpcCommand(accessToken, "update_senior_contact", payload),
  createMethod: (accessToken: string, payload: Record<string, unknown>) =>
    rpcCommand(accessToken, "create_contact_method", payload),
  updateMethod: (accessToken: string, payload: Record<string, unknown>) =>
    rpcCommand(accessToken, "update_contact_method", payload),
  recordConsent: (accessToken: string, payload: Record<string, unknown>) =>
    rpcCommand(accessToken, "record_contact_consent", payload),
};

export async function previewRecipient(args: {
  accessToken: string;
  seniorId: string;
  category: NotificationCategory;
  destination: NotificationDestination;
  evaluationTime: string;
  requestedChannel?: ContactChannel | null;
}): Promise<RecipientSelectionResult> {
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) throw new Error("Contact plan persistence unavailable");
  const { data, error } = await (client as unknown as {
    rpc: (name: string, payload: Record<string, unknown>) => Promise<{
      data: unknown; error: { code?: string } | null;
    }>;
  }).rpc("preview_notification_recipient", {
      p_senior_id: args.seniorId,
      p_notification_category: args.category,
      p_escalation_destination: args.destination,
      p_evaluation_time: args.evaluationTime,
      p_requested_channel: args.requestedChannel ?? null,
    });
  if (error) throw new Error("Recipient preview failed");
  return mapRecipientResult(data);
}
