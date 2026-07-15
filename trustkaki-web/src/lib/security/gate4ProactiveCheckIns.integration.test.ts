import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getSupabaseServerConfig } from "@/lib/supabase/config";

const describeDatabase =
  process.env.TRUSTKAKI_RUN_LIVE_SUPABASE === "1"
    ? describe.sequential
    : describe.skip;

interface AdminFixture {
  userId: string;
  caregiverId: string;
  client: SupabaseClient;
}

describeDatabase("Gate 4 proactive check-in integration", () => {
  let serviceA: SupabaseClient;
  let serviceB: SupabaseClient;
  let adminA: AdminFixture;
  let adminB: AdminFixture;
  let sharedSeniorId: string;
  let privateSeniorId: string;
  let scheduleId: string;
  let workflowId: string;
  let jobId: string;

  async function createAdmin(label: string): Promise<AdminFixture> {
    const config = getSupabaseServerConfig();
    if (!config) throw new Error("Supabase integration configuration is missing");
    const email = `trustkaki-gate4-${label}-${randomUUID()}@example.com`;
    const password = `Tk-${randomUUID()}`;
    const user = await serviceA.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      app_metadata: { role: "demo_admin" },
    });
    if (user.error || !user.data.user) throw new Error("Gate 4 admin creation failed");
    const caregiverId = randomUUID();
    const caregiver = await serviceA.from("caregivers").insert({
      id: caregiverId,
      external_ref: `gate4-${label}-${randomUUID()}`,
      display_name: `Gate 4 ${label}`,
      relationship: "administrator",
      auth_user_id: user.data.user.id,
    });
    if (caregiver.error) throw new Error("Gate 4 caregiver creation failed");

    const authClient = createClient(config.url, config.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const session = await authClient.auth.signInWithPassword({ email, password });
    if (session.error || !session.data.session) throw new Error("Gate 4 sign-in failed");
    return { userId: user.data.user.id, caregiverId, client: authClient };
  }

  beforeAll(async () => {
    const config = getSupabaseServerConfig();
    if (!config) throw new Error("Supabase integration configuration is missing");
    serviceA = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    serviceB = createClient(config.url, config.serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    adminA = await createAdmin("admin-a");
    adminB = await createAdmin("admin-b");
    sharedSeniorId = randomUUID();
    privateSeniorId = randomUUID();
    const seniors = await serviceA.from("seniors").insert([
      {
        id: sharedSeniorId,
        external_ref: `gate4-shared-${randomUUID()}`,
        display_name: "Gate 4 Shared Senior",
        risk_level: "green",
      },
      {
        id: privateSeniorId,
        external_ref: `gate4-private-${randomUUID()}`,
        display_name: "Gate 4 Private Senior",
        risk_level: "green",
      },
    ]);
    if (seniors.error) throw new Error("Gate 4 senior creation failed");
    const links = await serviceA.from("senior_caregivers").insert([
      {
        senior_id: sharedSeniorId,
        caregiver_id: adminA.caregiverId,
        role: "caregiver",
      },
      {
        senior_id: privateSeniorId,
        caregiver_id: adminB.caregiverId,
        role: "caregiver",
      },
    ]);
    if (links.error) throw new Error("Gate 4 relationship creation failed");

    scheduleId = randomUUID();
    const now = new Date().toISOString();
    const schedule = await serviceA.from("proactive_check_in_schedules").insert({
      id: scheduleId,
      senior_id: sharedSeniorId,
      platform: "telegram",
      local_send_time: "09:00:00",
      timezone: "Asia/Singapore",
      active_weekdays: [1, 2, 3, 4, 5, 6, 7],
      initial_response_minutes: 120,
      retry_response_minutes: 60,
      initial_message_template: "Good morning. How are you today?",
      retry_message_template: "Just checking again. Reply when convenient.",
      next_run_at: new Date(Date.now() + 86_400_000).toISOString(),
      created_by_caregiver_id: adminA.caregiverId,
      updated_by_caregiver_id: adminA.caregiverId,
    });
    if (schedule.error) throw new Error("Gate 4 schedule creation failed");
    workflowId = randomUUID();
    const workflow = await serviceA.from("proactive_check_in_workflows").insert({
      id: workflowId,
      schedule_id: scheduleId,
      senior_id: sharedSeniorId,
      status: "pending_initial_send",
      started_at: now,
    });
    if (workflow.error) throw new Error("Gate 4 workflow creation failed");
    jobId = randomUUID();
    const job = await serviceA.from("scheduled_jobs").insert({
      id: jobId,
      senior_id: sharedSeniorId,
      job_type: "morning_check_in",
      status: "pending",
      scheduled_for: now,
      next_eligible_at: now,
      schedule_id: scheduleId,
      workflow_id: workflowId,
      stage: "initial_send",
      idempotency_key: `gate4:${workflowId}:initial_send`,
      payload: {},
    });
    if (job.error) throw new Error("Gate 4 job creation failed");
  });

  afterAll(async () => {
    if (sharedSeniorId && privateSeniorId) {
      await serviceA.from("seniors").delete().in("id", [sharedSeniorId, privateSeniorId]);
    }
    for (const admin of [adminA, adminB].filter(Boolean)) {
      await serviceA.from("caregivers").delete().eq("id", admin.caregiverId);
      await serviceA.auth.admin.deleteUser(admin.userId);
    }
  });

  it("keeps schedules visible only to caregivers linked to the senior", async () => {
    const authorized = await adminA.client
      .from("proactive_check_in_schedules")
      .select("id")
      .eq("id", scheduleId);
    const unrelated = await adminB.client
      .from("proactive_check_in_schedules")
      .select("id")
      .eq("id", scheduleId);
    const deniedMutation = await adminB.client.rpc(
      "manage_proactive_check_in_schedule",
      {
        p_senior_id: sharedSeniorId,
        p_command_id: randomUUID(),
        p_action: "pause",
        p_platform: "telegram",
        p_local_send_time: "09:00",
        p_timezone: "Asia/Singapore",
        p_active_weekdays: [1, 2, 3, 4, 5, 6, 7],
        p_initial_response_minutes: 120,
        p_retry_response_minutes: 60,
        p_initial_message_template: "Good morning. How are you today?",
        p_retry_message_template: "Just checking again. Reply when convenient.",
        p_reason: "Unrelated admin must not pause this schedule.",
        p_now: new Date().toISOString(),
      }
    );

    expect(authorized.error).toBeNull();
    expect(authorized.data).toEqual([{ id: scheduleId }]);
    expect(unrelated.error).toBeNull();
    expect(unrelated.data).toEqual([]);
    expect(deniedMutation.error?.code).toBe("42501");
  });

  it("allows exactly one worker to claim and advance a due job", async () => {
    const now = new Date(Date.now() + 1_000).toISOString();
    const [claimA, claimB] = await Promise.all([
      serviceA.rpc("claim_due_proactive_check_in_jobs", {
        p_limit: 10,
        p_worker_id: "gate4-worker-a",
        p_now: now,
      }),
      serviceB.rpc("claim_due_proactive_check_in_jobs", {
        p_limit: 10,
        p_worker_id: "gate4-worker-b",
        p_now: now,
      }),
    ]);
    expect(claimA.error).toBeNull();
    expect(claimB.error).toBeNull();
    const claims = [...(claimA.data ?? []), ...(claimB.data ?? [])].filter(
      (row) => row.id === jobId
    );
    expect(claims).toHaveLength(1);

    const winner = String(claims[0].claimed_by);
    const nextAt = new Date(Date.parse(now) + 7_200_000).toISOString();
    const first = await serviceA.rpc("advance_proactive_check_in_job", {
      p_job_id: jobId,
      p_worker_id: winner,
      p_next_stage: "initial_deadline",
      p_next_scheduled_for: nextAt,
      p_client_message_id: `gate4-message-${workflowId}`,
      p_now: now,
    });
    const stale = await serviceB.rpc("advance_proactive_check_in_job", {
      p_job_id: jobId,
      p_worker_id: winner,
      p_next_stage: "initial_deadline",
      p_next_scheduled_for: nextAt,
      p_client_message_id: `gate4-message-${workflowId}`,
      p_now: now,
    });
    const nextJobs = await serviceA
      .from("scheduled_jobs")
      .select("id")
      .eq("workflow_id", workflowId)
      .eq("stage", "initial_deadline");

    expect(first.error).toBeNull();
    expect(stale.error?.code).toBe("PT409");
    expect(nextJobs.error).toBeNull();
    expect(nextJobs.data).toHaveLength(1);
  });
});
