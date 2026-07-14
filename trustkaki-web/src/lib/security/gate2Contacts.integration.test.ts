import { randomUUID } from "node:crypto";
import {
  createClient,
  type RealtimeChannel,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSupabaseServerConfig } from "@/lib/supabase/config";
import type { Json } from "@/lib/supabase/types";
import {
  createSupabaseRlsFixture,
  type SupabaseRlsFixture,
} from "./supabaseTestFixture";

const describeDatabase =
  process.env.TRUSTKAKI_RUN_DB_INTEGRATION === "1"
    ? describe.sequential
    : describe.skip;

interface AdminFixture {
  userId: string;
  caregiverId: string;
  client: SupabaseClient;
  cleanup: () => Promise<void>;
}

function result(value: unknown): Record<string, Json> {
  return value as Record<string, Json>;
}

async function subscribe(channel: RealtimeChannel, statuses: string[]) {
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Realtime subscription timed out: ${statuses.join(",")}`)),
      10_000
    );
    channel.subscribe((status, error) => {
      statuses.push(error ? `${status}:${error.message}` : status);
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        clearTimeout(timer);
        reject(new Error(`Realtime subscription entered ${status}`));
      }
    });
  });
}

async function pollContactVersion(args: {
  client: SupabaseClient;
  contactId: string;
  previousUpdatedAt: string;
}) {
  const deadline = Date.now() + 5_000;
  do {
    const read = await args.client
      .from("senior_contacts")
      .select("updated_at")
      .eq("id", args.contactId)
      .single();
    if (read.error) throw new Error("Contact polling fallback failed");
    if (read.data.updated_at !== args.previousUpdatedAt) return read.data.updated_at;
    await new Promise((resolve) => setTimeout(resolve, 250));
  } while (Date.now() < deadline);
  throw new Error("Contact polling fallback did not observe the committed update");
}

function waitForContactEvent(args: {
  event: Promise<string>;
  statuses: string[];
}) {
  return Promise.race([
    args.event,
    new Promise<never>((_, reject) => setTimeout(
      () => reject(new Error(`Realtime event timed out: ${args.statuses.join(",")}`)),
      5_000
    )),
  ]);
}

async function createAdminFixture(
  fixture: SupabaseRlsFixture
): Promise<AdminFixture> {
  const config = getSupabaseServerConfig();
  if (!config) throw new Error("Supabase integration configuration is missing");
  const caregiverId = randomUUID();
  const email = `trustkaki-gate2-admin-${randomUUID()}@example.com`;
  const password = `Tk-${randomUUID()}`;
  const created = await fixture.serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role: "demo_admin" },
  });
  if (created.error || !created.data.user) {
    throw new Error("Gate 2 admin user creation failed");
  }

  try {
    const caregiver = await fixture.serviceClient.from("caregivers").insert({
      id: caregiverId,
      external_ref: `gate2-admin-${randomUUID()}`,
      display_name: "Gate 2 Administrator",
      relationship: "administrator",
      auth_user_id: created.data.user.id,
    });
    if (caregiver.error) throw new Error("Gate 2 admin caregiver creation failed");
    const relationship = await fixture.serviceClient
      .from("senior_caregivers")
      .insert({
        senior_id: fixture.sharedSeniorId,
        caregiver_id: caregiverId,
        role: "caregiver",
      });
    if (relationship.error) {
      throw new Error("Gate 2 admin relationship creation failed");
    }

    const authClient = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const signedIn = await authClient.auth.signInWithPassword({ email, password });
    if (signedIn.error || !signedIn.data.session) {
      throw new Error("Gate 2 admin sign-in failed");
    }
    return {
      userId: created.data.user.id,
      caregiverId,
      client: authClient,
      cleanup: async () => {
        await fixture.serviceClient.from("caregivers").delete().eq("id", caregiverId);
        await fixture.serviceClient.auth.admin.deleteUser(created.data.user.id);
      },
    };
  } catch (error) {
    await fixture.serviceClient.from("caregivers").delete().eq("id", caregiverId);
    await fixture.serviceClient.auth.admin.deleteUser(created.data.user.id);
    throw error;
  }
}

describeDatabase("Gate 2 contacts and consent integration", () => {
  let fixture: SupabaseRlsFixture;
  let admin: AdminFixture;
  let observer: AdminFixture;
  let contactId: string;
  let contactUpdatedAt: string;
  let methodId: string;
  let methodUpdatedAt: string;
  let consentCommandId: string;
  let consentConfirmedAt: string;

  beforeAll(async () => {
    fixture = await createSupabaseRlsFixture();
    admin = await createAdminFixture(fixture);
    observer = await createAdminFixture(fixture);
  });

  afterAll(async () => {
    await fixture?.cleanup();
    await admin?.cleanup();
    await observer?.cleanup();
  });

  it("keeps contact plans admin-only and senior-scoped", async () => {
    const denied = await fixture.caregiverA.client.rpc("create_senior_contact", {
      p_senior_id: fixture.sharedSeniorId,
      p_command_id: randomUUID(),
      p_display_name: "Denied Contact",
      p_relationship: "daughter",
      p_contact_kind: "family_guardian",
      p_preferred_language: "en",
      p_timezone: "Asia/Singapore",
      p_escalation_priority: 1,
    });
    const caregiverRead = await fixture.caregiverA.client
      .from("senior_contacts")
      .select("id")
      .eq("senior_id", fixture.sharedSeniorId);

    expect(denied.error?.code).toBe("42501");
    expect(caregiverRead.error).toBeNull();
    expect(caregiverRead.data).toEqual([]);
  });

  it("creates one auditable contact and replays its command once", async () => {
    const commandId = randomUUID();
    const payload = {
      p_senior_id: fixture.sharedSeniorId,
      p_command_id: commandId,
      p_display_name: "Gate 2 Family Contact",
      p_relationship: "daughter",
      p_contact_kind: "family_guardian",
      p_preferred_language: "en",
      p_timezone: "Asia/Singapore",
      p_escalation_priority: 1,
    } as const;
    const first = await admin.client.rpc("create_senior_contact", payload);
    const duplicate = await admin.client.rpc("create_senior_contact", payload);
    const created = result(first.data);
    const replayed = result(duplicate.data);
    const audit = await fixture.serviceClient
      .from("contact_plan_audit_events")
      .select("actor_caregiver_id")
      .eq("command_id", commandId);

    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(replayed.duplicate).toBe(true);
    expect(audit.data).toEqual([{ actor_caregiver_id: admin.caregiverId }]);
    const differentActor = await observer.client.rpc("create_senior_contact", payload);
    expect(differentActor.error?.code).toBe("22023");
    contactId = String(created.id);
    contactUpdatedAt = String(created.updated_at);
  });

  it("rejects a reused contact command ID when its normalized payload changes", async () => {
    const commandId = randomUUID();
    const payload = {
      p_senior_id: fixture.sharedSeniorId,
      p_command_id: commandId,
      p_display_name: "Payload Bound Contact",
      p_relationship: "daughter",
      p_contact_kind: "family_guardian",
      p_preferred_language: "en",
      p_timezone: "Asia/Singapore",
      p_escalation_priority: 2,
    } as const;
    const first = await admin.client.rpc("create_senior_contact", payload);
    const changed = await admin.client.rpc("create_senior_contact", {
      ...payload,
      p_relationship: "son",
    });

    expect(first.error).toBeNull();
    expect(changed.error?.code).toBe("22023");
  });

  it("verifies a method without replacing its destination and records consent once", async () => {
    const createMethod = await admin.client.rpc("create_contact_method", {
      p_contact_id: contactId,
      p_command_id: randomUUID(),
      p_channel: "whatsapp",
      p_destination_normalized: "+6590001234",
      p_method_priority: 1,
      p_timezone: "Asia/Singapore",
      p_quiet_hours_start: "22:00:00",
      p_quiet_hours_end: "07:00:00",
    });
    expect(createMethod.error).toBeNull();
    methodId = String(result(createMethod.data).id);
    methodUpdatedAt = String(result(createMethod.data).updated_at);

    const verifiedAt = new Date().toISOString();
    consentConfirmedAt = verifiedAt;
    const verifyCommandId = randomUUID();
    const verifyPayload = {
      p_method_id: methodId,
      p_command_id: verifyCommandId,
      p_expected_updated_at: methodUpdatedAt,
      p_channel: "whatsapp",
      p_destination_normalized: null,
      p_verification_status: "verified",
      p_verification_method: "admin_confirmed",
      p_verified_at: verifiedAt,
      p_method_priority: 1,
      p_timezone: "Asia/Singapore",
      p_quiet_hours_start: "22:00:00",
      p_quiet_hours_end: "07:00:00",
      p_active: true,
    } as const;
    const verifyMethod = await admin.client.rpc("update_contact_method", verifyPayload);
    const verifyDuplicate = await admin.client.rpc("update_contact_method", verifyPayload);
    const verifyChanged = await admin.client.rpc("update_contact_method", {
      ...verifyPayload,
      p_method_priority: 2,
    });
    expect(verifyMethod.error).toBeNull();
    expect(verifyDuplicate.error).toBeNull();
    expect(result(verifyDuplicate.data).duplicate).toBe(true);
    expect(verifyChanged.error?.code).toBe("22023");
    methodUpdatedAt = String(result(verifyMethod.data).updated_at);
    const storedMethod = await fixture.serviceClient
      .from("contact_methods")
      .select("destination_normalized, verification_status")
      .eq("id", methodId)
      .single();
    expect(storedMethod.data).toEqual({
      destination_normalized: "+6590001234",
      verification_status: "verified",
    });

    consentCommandId = randomUUID();
    const consentPayload = {
      p_method_id: methodId,
      p_command_id: consentCommandId,
      p_event_type: "granted",
      p_permitted_categories: [
        "wellbeing_follow_up",
        "health_safety",
        "urgent_safety",
      ],
      p_allow_urgent_quiet_hours: true,
      p_confirmation_method: "verbal",
      p_confirmed_at: verifiedAt,
      p_expires_at: null,
      p_note: "Contact confirmed notification consent for this test.",
    } as const;
    const first = await admin.client.rpc("record_contact_consent", consentPayload);
    const duplicate = await admin.client.rpc(
      "record_contact_consent",
      consentPayload
    );
    const events = await fixture.serviceClient
      .from("contact_consent_events")
      .select("actor_caregiver_id")
      .eq("command_id", consentCommandId);

    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(result(duplicate.data).duplicate).toBe(true);
    expect(events.data).toEqual([{ actor_caregiver_id: admin.caregiverId }]);
    const changedConsent = await admin.client.rpc("record_contact_consent", {
      ...consentPayload,
      p_note: "A different note must not reuse the same consent command ID.",
    });
    expect(changedConsent.error?.code).toBe("22023");
  });

  it("rejects a reused method command ID when its normalized destination changes", async () => {
    const commandId = randomUUID();
    const payload = {
      p_contact_id: contactId,
      p_command_id: commandId,
      p_channel: "sms",
      p_destination_normalized: "+65 9000 5678",
      p_method_priority: 2,
      p_timezone: "Asia/Singapore",
      p_quiet_hours_start: null,
      p_quiet_hours_end: null,
    } as const;
    const first = await admin.client.rpc("create_contact_method", payload);
    const duplicate = await admin.client.rpc("create_contact_method", {
      ...payload,
      p_destination_normalized: "+6590005678",
    });
    const changed = await admin.client.rpc("create_contact_method", {
      ...payload,
      p_destination_normalized: "+6599995678",
    });

    expect(first.error).toBeNull();
    expect(duplicate.error).toBeNull();
    expect(result(duplicate.data).duplicate).toBe(true);
    expect(changed.error?.code).toBe("22023");
  });

  it("authorizes before consent replay and explains quiet-hour decisions", async () => {
    const replayAttack = await fixture.caregiverA.client.rpc(
      "record_contact_consent",
      {
        p_method_id: methodId,
        p_command_id: consentCommandId,
        p_event_type: "granted",
        p_permitted_categories: [
          "wellbeing_follow_up",
          "health_safety",
          "urgent_safety",
        ],
        p_allow_urgent_quiet_hours: true,
        p_confirmation_method: "verbal",
        p_confirmed_at: consentConfirmedAt,
        p_expires_at: null,
        p_note: "Contact confirmed notification consent for this test.",
      }
    );
    expect(replayAttack.error?.code).toBe("42501");

    const normal = await admin.client.rpc("preview_notification_recipient", {
      p_senior_id: fixture.sharedSeniorId,
      p_notification_category: "health_safety",
      p_escalation_destination: "family_guardian",
      p_evaluation_time: "2026-07-14T15:00:00.000Z",
      p_requested_channel: "whatsapp",
    });
    const urgent = await admin.client.rpc("preview_notification_recipient", {
      p_senior_id: fixture.sharedSeniorId,
      p_notification_category: "urgent_safety",
      p_escalation_destination: "family_guardian",
      p_evaluation_time: "2026-07-14T15:00:00.000Z",
      p_requested_channel: "whatsapp",
    });

    expect(normal.error).toBeNull();
    expect(result(normal.data).result).toBe("no_eligible_contact");
    expect(JSON.stringify(result(normal.data).skipped_reasons)).toContain(
      "quiet_hours"
    );
    expect(urgent.error).toBeNull();
    expect(result(urgent.data)).toEqual(
      expect.objectContaining({
        result: "candidate_selected",
        selected_contact_id: contactId,
        selected_method_id: methodId,
      })
    );
  });

  it("delivers contact updates through Realtime and rejects stale writes without partial history", async () => {
    const statuses: string[] = [];
    let resolveEvent: (updatedAt: string) => void = () => undefined;
    const event = new Promise<string>((resolve) => { resolveEvent = resolve; });
    const channel = observer.client
      .channel(`gate2-contact-${randomUUID()}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "senior_contacts",
          filter: `id=eq.${contactId}`,
        },
        (payload) => {
          resolveEvent(String((payload.new as { updated_at?: string }).updated_at ?? ""));
        }
      );
    await subscribe(channel, statuses);
    const firstCommand = randomUUID();
    try {
      const first = await admin.client.rpc("update_senior_contact", {
        p_contact_id: contactId,
        p_command_id: firstCommand,
        p_expected_updated_at: contactUpdatedAt,
        p_display_name: "Gate 2 Family Contact",
        p_relationship: "daughter",
        p_contact_kind: "family_guardian",
        p_preferred_language: "en",
        p_timezone: "Asia/Singapore",
        p_escalation_priority: 1,
        p_active: true,
      });
      expect(first.error).toBeNull();
      const deliveredUpdatedAt = await waitForContactEvent({ event, statuses });
      expect(deliveredUpdatedAt).not.toBe("");
      const changedReplay = await admin.client.rpc("update_senior_contact", {
        p_contact_id: contactId,
        p_command_id: firstCommand,
        p_expected_updated_at: contactUpdatedAt,
        p_display_name: "Changed replay",
        p_relationship: "daughter",
        p_contact_kind: "family_guardian",
        p_preferred_language: "en",
        p_timezone: "Asia/Singapore",
        p_escalation_priority: 1,
        p_active: true,
      });
      await new Promise((resolve) => setTimeout(resolve, 1_000));

      const staleCommand = randomUUID();
      const stale = await admin.client.rpc("update_senior_contact", {
        p_contact_id: contactId,
        p_command_id: staleCommand,
        p_expected_updated_at: contactUpdatedAt,
        p_display_name: "Stale overwrite",
        p_relationship: "daughter",
        p_contact_kind: "family_guardian",
        p_preferred_language: "en",
        p_timezone: "Asia/Singapore",
        p_escalation_priority: 1,
        p_active: true,
      });
      const staleAudits = await fixture.serviceClient
        .from("contact_plan_audit_events")
        .select("id", { count: "exact", head: true })
        .eq("command_id", staleCommand);

      expect(statuses).toContain("SUBSCRIBED");
      expect(changedReplay.error?.code).toBe("22023");
      expect(stale.error?.code).toBe("PT409");
      expect(staleAudits.count).toBe(0);
    } finally {
      await observer.client.removeChannel(channel);
    }
  }, 15_000);

  it("observes contact changes through the bounded polling fallback independently", async () => {
    const before = await observer.client
      .from("senior_contacts")
      .select("updated_at")
      .eq("id", contactId)
      .single();
    expect(before.error).toBeNull();
    const previousUpdatedAt = String(before.data?.updated_at);
    const update = await admin.client.rpc("update_senior_contact", {
      p_contact_id: contactId,
      p_command_id: randomUUID(),
      p_expected_updated_at: previousUpdatedAt,
      p_display_name: "Gate 2 Family Contact",
      p_relationship: "daughter",
      p_contact_kind: "family_guardian",
      p_preferred_language: "en",
      p_timezone: "Asia/Singapore",
      p_escalation_priority: 1,
      p_active: true,
    });

    expect(update.error).toBeNull();
    await expect(pollContactVersion({
      client: observer.client,
      contactId,
      previousUpdatedAt,
    })).resolves.not.toBe(previousUpdatedAt);
  }, 10_000);

  it("persists one consent-bound escalation decision without claiming delivery", async () => {
    const before = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const assign = await fixture.caregiverA.client.rpc(
      "record_caregiver_queue_action",
      {
        p_queue_item_id: fixture.sharedQueueId,
        p_action_type: "assign",
        p_command_id: randomUUID(),
        p_expected_updated_at: before.data?.updated_at ?? "",
        p_assigned_caregiver_id: fixture.caregiverB.caregiverId,
      }
    );
    expect(assign.error).toBeNull();
    const assigned = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("updated_at")
      .eq("id", fixture.sharedQueueId)
      .single();
    const commandId = randomUUID();
    const payload = {
      p_queue_item_id: fixture.sharedQueueId,
      p_command_id: commandId,
      p_expected_updated_at: assigned.data?.updated_at ?? "",
      p_escalation_destination: "family_guardian",
      p_notification_category: "urgent_safety",
      p_note: "Urgent wellbeing concern requires family follow-up now.",
    } as const;
    const first = await fixture.caregiverA.client.rpc(
      "escalate_caregiver_queue_case",
      payload
    );
    const duplicate = await fixture.caregiverA.client.rpc(
      "escalate_caregiver_queue_case",
      payload
    );
    const changedCategory = await fixture.caregiverA.client.rpc(
      "escalate_caregiver_queue_case",
      { ...payload, p_notification_category: "health_safety" }
    );
    const decisions = await fixture.serviceClient
      .from("notification_recipient_decisions")
      .select(
        "notification_category, selected_contact_id, selected_method_id, result"
      )
      .eq("command_id", commandId);
    const actions = await fixture.serviceClient
      .from("caregiver_actions")
      .select("caregiver_id")
      .eq("command_id", commandId);
    const queue = await fixture.serviceClient
      .from("caregiver_queue_items")
      .select("status, assigned_caregiver_id")
      .eq("id", fixture.sharedQueueId)
      .single();

    expect(first.error).toBeNull();
    expect(result(first.data).recipient_decision).toEqual(
      expect.objectContaining({ result: "candidate_selected", delivered: false })
    );
    expect(duplicate.error).toBeNull();
    expect(result(duplicate.data).duplicate).toBe(true);
    expect(changedCategory.error?.code).toBe("22023");
    expect(decisions.data).toEqual([
      {
        notification_category: "urgent_safety",
        selected_contact_id: contactId,
        selected_method_id: methodId,
        result: "candidate_selected",
      },
    ]);
    expect(actions.data).toEqual([{ caregiver_id: fixture.caregiverA.caregiverId }]);
    expect(queue.data).toEqual({
      status: "escalated",
      assigned_caregiver_id: fixture.caregiverB.caregiverId,
    });
  });
});
