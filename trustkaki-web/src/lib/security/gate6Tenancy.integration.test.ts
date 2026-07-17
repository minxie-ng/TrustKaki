import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSupabaseServerConfig } from "@/lib/supabase/config";
import { assertTrustKakiLiveProjectIdentity } from "./liveProjectGuard";

const describeLive = process.env.TRUSTKAKI_RUN_LIVE_SUPABASE === "1"
  ? describe.sequential
  : describe.skip;
const supabaseRoot = resolve(process.cwd(), "../../..");

interface IdentityFixture {
  userId: string;
  caregiverId: string;
  client: SupabaseClient;
}

function boundedFailure(
  operation: string,
  error: { code?: string; status?: number } | null
): Error {
  const code = error?.code ?? error?.status;
  return new Error(`${operation} failed${code ? ` (${code})` : ""}`);
}

function requireSuccess(
  operation: string,
  result: { error: { code?: string; status?: number } | null }
): void {
  if (result.error) throw boundedFailure(operation, result.error);
}

describeLive("Gate 6 organisation tenancy and revocation", () => {
  const runId = randomUUID();
  const marker = `trustkaki-gate6-${runId}`;
  const organisationIds = [randomUUID(), randomUUID()];
  const seniorIds = [randomUUID(), randomUUID(), randomUUID()];
  const caregiverIds = Array.from({ length: 6 }, () => randomUUID());
  const checkInIds = [randomUUID(), randomUUID()];
  const messageIds = [randomUUID(), randomUUID()];
  const pendingUserIds = new Set<string>();
  let service: SupabaseClient | undefined;
  let adminA: IdentityFixture;
  let staffA: IdentityFixture;
  let volunteerA: IdentityFixture;
  let familyA: IdentityFixture;
  let adminB: IdentityFixture;
  let demoOnly: IdentityFixture;
  let cleanupComplete = false;

  async function createIdentity(
    index: number,
    label: string,
    demoAdmin = false
  ): Promise<IdentityFixture> {
    const config = getSupabaseServerConfig();
    if (!config || !service) {
      throw new Error("Gate 6 integration configuration is missing");
    }
    const email = `${marker}-${label}@example.com`;
    const password = `Tk-${randomUUID()}`;
    const created = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: demoAdmin ? { role: "demo_admin" } : {},
    });
    requireSuccess(`Gate 6 ${label} auth creation`, created);
    if (!created.data.user) throw new Error(`Gate 6 ${label} auth user missing`);
    pendingUserIds.add(created.data.user.id);

    requireSuccess(
      `Gate 6 ${label} caregiver creation`,
      await service.from("caregivers").insert({
        id: caregiverIds[index],
        external_ref: `${marker}-${label}`,
        display_name: `Gate 6 ${label}`,
        relationship: "synthetic test identity",
        auth_user_id: created.data.user.id,
      })
    );

    const client = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await client.auth.signInWithPassword({ email, password });
    requireSuccess(`Gate 6 ${label} sign-in`, session);
    if (!session.data.session) throw new Error(`Gate 6 ${label} session missing`);
    return { userId: created.data.user.id, caregiverId: caregiverIds[index], client };
  }

  async function visibleSeniorIds(client: SupabaseClient): Promise<string[]> {
    const result = await client.from("seniors").select("id").in("id", seniorIds);
    requireSuccess("Gate 6 visible senior read", result);
    return (result.data ?? []).map((row) => String(row.id)).sort();
  }

  async function visibleMessageSeniorIds(client: SupabaseClient): Promise<string[]> {
    const result = await client.from("messages").select("senior_id").in("id", messageIds);
    requireSuccess("Gate 6 visible message read", result);
    return (result.data ?? []).map((row) => String(row.senior_id)).sort();
  }

  async function cleanup(): Promise<void> {
    if (cleanupComplete) return;
    await assertTrustKakiLiveProjectIdentity(supabaseRoot);
    if (!service) {
      cleanupComplete = true;
      return;
    }

    const failures: Error[] = [];
    const remove = async (
      operation: string,
      action: PromiseLike<{ error: { code?: string; status?: number } | null }>
    ) => {
      try {
        const result = await action;
        if (result.error) failures.push(boundedFailure(operation, result.error));
      } catch {
        failures.push(boundedFailure(operation, null));
      }
    };

    await remove(
      "Gate 6 message cleanup",
      service.from("messages").delete().in("id", messageIds)
    );
    await remove(
      "Gate 6 check-in cleanup",
      service.from("check_ins").delete().in("id", checkInIds)
    );
    await remove(
      "Gate 6 senior-link cleanup",
      service.from("senior_caregivers").delete().in("senior_id", seniorIds)
    );
    await remove(
      "Gate 6 senior cleanup",
      service.from("seniors").delete().in("id", seniorIds)
    );
    await remove(
      "Gate 6 membership cleanup",
      service.from("organisation_memberships").delete().in("caregiver_id", caregiverIds)
    );
    await remove(
      "Gate 6 caregiver cleanup",
      service.from("caregivers").delete().in("id", caregiverIds)
    );
    await remove(
      "Gate 6 organisation cleanup",
      service.from("organisations").delete().in("id", organisationIds)
    );

    for (const userId of [...pendingUserIds]) {
      try {
        const deletion = await service.auth.admin.deleteUser(userId);
        if (deletion.error) {
          failures.push(boundedFailure("Gate 6 auth user cleanup", deletion.error));
        } else {
          pendingUserIds.delete(userId);
        }
      } catch {
        failures.push(boundedFailure("Gate 6 auth user cleanup", null));
      }
    }

    try {
      const verification = await Promise.all([
        service.from("organisations").select("id").in("id", organisationIds),
        service.from("organisations").select("id").like("slug", `${marker}%`),
        service.from("organisation_memberships").select("id").in("caregiver_id", caregiverIds),
        service.from("seniors").select("id").in("id", seniorIds),
        service.from("seniors").select("id").like("external_ref", `${marker}%`),
        service.from("caregivers").select("id").in("id", caregiverIds),
        service.from("caregivers").select("id").like("external_ref", `${marker}%`),
        service.from("check_ins").select("id").in("id", checkInIds),
        service.from("messages").select("id").in("id", messageIds),
      ]);
      for (const result of verification) {
        if (result.error) {
          failures.push(boundedFailure("Gate 6 cleanup verification", result.error));
        } else if (result.data?.length) {
          failures.push(new Error("Gate 6 cleanup verification found temporary rows"));
        }
      }
    } catch {
      failures.push(boundedFailure("Gate 6 cleanup verification", null));
    }

    if (failures.length) throw new AggregateError(failures, "Gate 6 cleanup failed");
    cleanupComplete = true;
  }

  beforeAll(async () => {
    await assertTrustKakiLiveProjectIdentity(supabaseRoot);
    const config = getSupabaseServerConfig();
    if (!config) throw new Error("Supabase integration configuration is missing");
    service = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    try {
      requireSuccess(
        "Gate 6 organisation creation",
        await service.from("organisations").insert([
          {
            id: organisationIds[0],
            slug: `${marker}-a`,
            display_name: "Gate 6 Synthetic Organisation A",
            organisation_type: "aac_centre",
          },
          {
            id: organisationIds[1],
            slug: `${marker}-b`,
            display_name: "Gate 6 Synthetic Organisation B",
            organisation_type: "aac_centre",
          },
        ])
      );

      adminA = await createIdentity(0, "admin-a");
      staffA = await createIdentity(1, "staff-a");
      volunteerA = await createIdentity(2, "volunteer-a");
      familyA = await createIdentity(3, "family-a");
      adminB = await createIdentity(4, "admin-b");
      demoOnly = await createIdentity(5, "demo-only", true);

      requireSuccess(
        "Gate 6 membership creation",
        await service.from("organisation_memberships").insert([
          { organisation_id: organisationIds[0], caregiver_id: adminA.caregiverId, role: "org_admin" },
          { organisation_id: organisationIds[0], caregiver_id: staffA.caregiverId, role: "staff" },
          { organisation_id: organisationIds[0], caregiver_id: volunteerA.caregiverId, role: "volunteer" },
          { organisation_id: organisationIds[1], caregiver_id: adminB.caregiverId, role: "org_admin" },
        ])
      );
      requireSuccess(
        "Gate 6 senior creation",
        await service.from("seniors").insert([
          { id: seniorIds[0], external_ref: `${marker}-senior-a1`, display_name: "Gate 6 Senior A1", organisation_id: organisationIds[0] },
          { id: seniorIds[1], external_ref: `${marker}-senior-a2`, display_name: "Gate 6 Senior A2", organisation_id: organisationIds[0] },
          { id: seniorIds[2], external_ref: `${marker}-senior-b1`, display_name: "Gate 6 Senior B1", organisation_id: organisationIds[1] },
        ])
      );
      requireSuccess(
        "Gate 6 explicit assignment creation",
        await service.from("senior_caregivers").insert([
          { senior_id: seniorIds[0], caregiver_id: volunteerA.caregiverId, role: "aac_volunteer" },
          { senior_id: seniorIds[1], caregiver_id: familyA.caregiverId, role: "caregiver" },
        ])
      );
      requireSuccess(
        "Gate 6 check-in creation",
        await service.from("check_ins").insert([
          { id: checkInIds[0], senior_id: seniorIds[0], status: "in_progress" },
          { id: checkInIds[1], senior_id: seniorIds[2], status: "in_progress" },
        ])
      );
      requireSuccess(
        "Gate 6 message creation",
        await service.from("messages").insert([
          {
            id: messageIds[0],
            check_in_id: checkInIds[0],
            senior_id: seniorIds[0],
            sender: "senior",
            text: "Synthetic Gate 6 organisation A message.",
            client_message_id: `${marker}-message-a`,
          },
          {
            id: messageIds[1],
            check_in_id: checkInIds[1],
            senior_id: seniorIds[2],
            sender: "senior",
            text: "Synthetic Gate 6 organisation B message.",
            client_message_id: `${marker}-message-b`,
          },
        ])
      );
    } catch (setupError) {
      try {
        await cleanup();
      } catch (cleanupError) {
        throw new AggregateError([setupError, cleanupError], "Gate 6 setup and cleanup failed");
      }
      throw setupError;
    }
  }, 60_000);

  afterAll(async () => {
    await cleanup();
  }, 60_000);

  it("grants only role-appropriate senior and dependent-message visibility", async () => {
    expect(await visibleSeniorIds(adminA.client)).toEqual([seniorIds[0], seniorIds[1]].sort());
    expect(await visibleSeniorIds(staffA.client)).toEqual([seniorIds[0], seniorIds[1]].sort());
    expect(await visibleSeniorIds(volunteerA.client)).toEqual([seniorIds[0]]);
    expect(await visibleSeniorIds(familyA.client)).toEqual([seniorIds[1]]);
    expect(await visibleSeniorIds(adminB.client)).toEqual([seniorIds[2]]);
    expect(await visibleSeniorIds(demoOnly.client)).toEqual([]);

    expect(await visibleMessageSeniorIds(adminA.client)).toEqual([seniorIds[0]]);
    expect(await visibleMessageSeniorIds(adminB.client)).toEqual([seniorIds[2]]);
    expect(await visibleMessageSeniorIds(demoOnly.client)).toEqual([]);
  }, 30_000);

  it("revokes membership access while preserving an independent family link", async () => {
    if (!service) throw new Error("Gate 6 service client missing");
    requireSuccess(
      "Gate 6 cross-organisation family-link creation",
      await service.from("senior_caregivers").insert({
        senior_id: seniorIds[2],
        caregiver_id: staffA.caregiverId,
        role: "caregiver",
      })
    );
    const deactivatedAt = "2026-07-18T00:00:00.000Z";
    requireSuccess(
      "Gate 6 membership deactivation",
      await service.from("organisation_memberships").update({
        active: false,
        deactivated_at: deactivatedAt,
      }).in("caregiver_id", [staffA.caregiverId, volunteerA.caregiverId])
    );

    expect(await visibleSeniorIds(staffA.client)).toEqual([seniorIds[2]]);
    expect(await visibleSeniorIds(volunteerA.client)).toEqual([]);

    requireSuccess(
      "Gate 6 membership reactivation",
      await service.from("organisation_memberships").update({
        active: true,
        deactivated_at: null,
      }).in("caregiver_id", [staffA.caregiverId, volunteerA.caregiverId])
    );
    expect(await visibleSeniorIds(staffA.client)).toEqual(seniorIds.slice().sort());
    expect(await visibleSeniorIds(volunteerA.client)).toEqual([seniorIds[0]]);
  }, 30_000);

  it("revokes organisation-derived access without revoking family access", async () => {
    if (!service) throw new Error("Gate 6 service client missing");
    requireSuccess(
      "Gate 6 organisation deactivation",
      await service.from("organisations").update({ active: false }).eq("id", organisationIds[0])
    );

    expect(await visibleSeniorIds(adminA.client)).toEqual([]);
    expect(await visibleSeniorIds(staffA.client)).toEqual([seniorIds[2]]);
    expect(await visibleSeniorIds(volunteerA.client)).toEqual([]);
    expect(await visibleSeniorIds(familyA.client)).toEqual([seniorIds[1]]);

    requireSuccess(
      "Gate 6 organisation reactivation",
      await service.from("organisations").update({ active: true }).eq("id", organisationIds[0])
    );
  }, 30_000);

  it("allows only the owning organisation admin and leaves denied commands empty", async () => {
    if (!service) throw new Error("Gate 6 service client missing");
    const createContact = (
      client: SupabaseClient,
      seniorId: string,
      commandId: string,
      label: string
    ) => client.rpc("create_senior_contact", {
      p_senior_id: seniorId,
      p_command_id: commandId,
      p_display_name: `${marker}-${label}`,
      p_relationship: "synthetic test contact",
      p_contact_kind: "family_guardian",
      p_preferred_language: "en",
      p_timezone: "Asia/Singapore",
      p_escalation_priority: 1,
    });

    const acceptedCommand = randomUUID();
    const accepted = await createContact(adminA.client, seniorIds[0], acceptedCommand, "accepted");
    expect(accepted.error).toBeNull();

    const deniedAttempts = [
      { client: adminA.client, seniorId: seniorIds[2], label: "cross-tenant" },
      { client: staffA.client, seniorId: seniorIds[0], label: "staff" },
      { client: volunteerA.client, seniorId: seniorIds[0], label: "volunteer" },
      { client: familyA.client, seniorId: seniorIds[0], label: "family" },
      { client: demoOnly.client, seniorId: seniorIds[0], label: "demo-only" },
    ];

    for (const attempt of deniedAttempts) {
      const commandId = randomUUID();
      const denied = await createContact(
        attempt.client,
        attempt.seniorId,
        commandId,
        attempt.label
      );
      expect(denied.error?.code).toBe("42501");

      const [contacts, audits] = await Promise.all([
        service.from("senior_contacts").select("id")
          .eq("display_name", `${marker}-${attempt.label}`),
        service.from("contact_plan_audit_events").select("id")
          .eq("command_id", commandId),
      ]);
      requireSuccess("Gate 6 denied contact verification", contacts);
      requireSuccess("Gate 6 denied audit verification", audits);
      expect(contacts.data).toEqual([]);
      expect(audits.data).toEqual([]);
    }
  }, 30_000);
});
