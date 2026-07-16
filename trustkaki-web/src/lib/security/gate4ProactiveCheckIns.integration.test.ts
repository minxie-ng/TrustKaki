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
    const acceptedCheckIn = await serviceA
      .from("check_ins")
      .insert({
        senior_id: sharedSeniorId,
        status: "active",
        risk_before: "green",
        risk_after: "green",
      })
      .select("id")
      .single();
    expect(acceptedCheckIn.error).toBeNull();
    const acceptance = await serviceA.from("messages").insert({
      check_in_id: acceptedCheckIn.data!.id,
      senior_id: sharedSeniorId,
      sender: "trustkaki",
      text: "Good morning. How are you today?",
      client_message_id: `gate4-message-${workflowId}`,
      external_platform: "telegram",
      external_message_id: `telegram-${randomUUID()}`,
      created_at: now,
    });
    expect(acceptance.error).toBeNull();
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

    await serviceA
      .from("proactive_check_in_workflows")
      .update({ status: "responded", responded_at: now })
      .eq("id", workflowId);
    await serviceA
      .from("scheduled_jobs")
      .update({ status: "cancelled", cancelled_at: now })
      .eq("workflow_id", workflowId)
      .eq("status", "pending");
  });

  it("cancels pending work when the persisted senior response is timely", async () => {
    const responseWorkflowId = randomUUID();
    const responseJobId = randomUUID();
    const checkInId = randomUUID();
    const clientMessageId = `gate4-response-${randomUUID()}`;
    const startedAt = new Date(Date.now() - 60_000).toISOString();
    const respondedAt = new Date().toISOString();
    const inserts = await Promise.all([
      serviceA.from("proactive_check_in_workflows").insert({
        id: responseWorkflowId,
        schedule_id: scheduleId,
        senior_id: sharedSeniorId,
        status: "awaiting_initial_response",
        started_at: startedAt,
        initial_sent_at: startedAt,
      }),
      serviceA.from("check_ins").insert({
        id: checkInId,
        senior_id: sharedSeniorId,
        status: "active",
        risk_before: "green",
        risk_after: "green",
      }),
    ]);
    expect(inserts.every(({ error }) => error === null)).toBe(true);
    const job = await serviceA.from("scheduled_jobs").insert({
      id: responseJobId,
      senior_id: sharedSeniorId,
      job_type: "morning_check_in",
      status: "pending",
      scheduled_for: respondedAt,
      next_eligible_at: respondedAt,
      schedule_id: scheduleId,
      workflow_id: responseWorkflowId,
      stage: "initial_deadline",
      idempotency_key: `gate4:${responseWorkflowId}:initial_deadline`,
      payload: {},
    });
    expect(job.error).toBeNull();
    const message = await serviceA.from("messages").insert({
      check_in_id: checkInId,
      senior_id: sharedSeniorId,
      sender: "senior",
      text: "I am okay, thank you.",
      client_message_id: clientMessageId,
      created_at: respondedAt,
    });
    expect(message.error).toBeNull();

    const response = await serviceA.rpc("record_proactive_check_in_response", {
      p_senior_id: sharedSeniorId,
      p_client_message_id: clientMessageId,
      p_responded_at: respondedAt,
    });
    const [workflow, pendingJob, queue] = await Promise.all([
      serviceA.from("proactive_check_in_workflows").select("status").eq("id", responseWorkflowId).single(),
      serviceA.from("scheduled_jobs").select("status").eq("id", responseJobId).single(),
      serviceA.from("caregiver_queue_items").select("id").eq("source_id", responseWorkflowId),
    ]);

    expect(response.error).toBeNull();
    expect(response.data).toMatchObject({ result: "pending_work_cancelled" });
    expect(workflow.data?.status).toBe("responded");
    expect(pendingJob.data?.status).toBe("cancelled");
    expect(queue.data).toEqual([]);
  });

  it("keeps a timely response authoritative against a claimed deadline job", async () => {
    const raceWorkflowId = randomUUID();
    const raceJobId = randomUUID();
    const checkInId = randomUUID();
    const clientMessageId = `gate4-race-${randomUUID()}`;
    const initialSentAt = new Date(Date.now() - 60_000).toISOString();
    const respondedAt = new Date().toISOString();
    const workerId = `gate4-race-worker-${randomUUID()}`;

    const inserts = await Promise.all([
      serviceA.from("proactive_check_in_workflows").insert({
        id: raceWorkflowId,
        schedule_id: scheduleId,
        senior_id: sharedSeniorId,
        status: "awaiting_initial_response",
        started_at: initialSentAt,
        initial_sent_at: initialSentAt,
      }),
      serviceA.from("check_ins").insert({
        id: checkInId,
        senior_id: sharedSeniorId,
        status: "active",
        risk_before: "green",
        risk_after: "green",
      }),
      serviceA.from("scheduled_jobs").insert({
        id: raceJobId,
        senior_id: sharedSeniorId,
        job_type: "morning_check_in",
        status: "running",
        scheduled_for: respondedAt,
        next_eligible_at: respondedAt,
        schedule_id: scheduleId,
        workflow_id: raceWorkflowId,
        stage: "initial_deadline",
        idempotency_key: `gate4:${raceWorkflowId}:initial_deadline`,
        claimed_by: workerId,
        claim_expires_at: new Date(Date.now() + 300_000).toISOString(),
        payload: {},
      }),
    ]);
    expect(inserts.every(({ error }) => error === null)).toBe(true);
    const message = await serviceA.from("messages").insert({
      check_in_id: checkInId,
      senior_id: sharedSeniorId,
      sender: "senior",
      text: "I am okay, thank you.",
      client_message_id: clientMessageId,
      created_at: respondedAt,
    });
    expect(message.error).toBeNull();

    const [response, advancement] = await Promise.all([
      serviceA.rpc("record_proactive_check_in_response", {
        p_senior_id: sharedSeniorId,
        p_client_message_id: clientMessageId,
        p_responded_at: respondedAt,
      }),
      serviceB.rpc("advance_proactive_check_in_job", {
        p_job_id: raceJobId,
        p_worker_id: workerId,
        p_next_stage: "retry_send",
        p_next_scheduled_for: respondedAt,
        p_client_message_id: `gate4-race-ready-${randomUUID()}`,
        p_now: respondedAt,
      }),
    ]);
    const [workflow, activeJobs, queue] = await Promise.all([
      serviceA
        .from("proactive_check_in_workflows")
        .select("status")
        .eq("id", raceWorkflowId)
        .single(),
      serviceA
        .from("scheduled_jobs")
        .select("id")
        .eq("workflow_id", raceWorkflowId)
        .in("status", ["pending", "failed", "running"]),
      serviceA
        .from("caregiver_queue_items")
        .select("id")
        .eq("source_id", raceWorkflowId),
    ]);

    expect(response.error).toBeNull();
    expect([null, "PT409"]).toContain(advancement.error?.code ?? null);
    expect(workflow.data?.status).toBe("responded");
    expect(activeJobs.data).toEqual([]);
    expect(queue.data).toEqual([]);
  });

  it("does not correlate a message received before provider acceptance", async () => {
    const correlationWorkflowId = randomUUID();
    const checkInId = randomUUID();
    const clientMessageId = `gate4-correlation-${randomUUID()}`;
    const startedAt = new Date(Date.now() - 120_000).toISOString();
    const respondedAt = new Date(Date.now() - 60_000).toISOString();
    const initialSentAt = new Date().toISOString();

    const inserts = await Promise.all([
      serviceA.from("proactive_check_in_workflows").insert({
        id: correlationWorkflowId,
        schedule_id: scheduleId,
        senior_id: sharedSeniorId,
        status: "awaiting_initial_response",
        started_at: startedAt,
        initial_sent_at: initialSentAt,
      }),
      serviceA.from("check_ins").insert({
        id: checkInId,
        senior_id: sharedSeniorId,
        status: "active",
        risk_before: "green",
        risk_after: "green",
      }),
    ]);
    expect(inserts.every(({ error }) => error === null)).toBe(true);
    const message = await serviceA.from("messages").insert({
      check_in_id: checkInId,
      senior_id: sharedSeniorId,
      sender: "senior",
      text: "This message belongs to the earlier conversation.",
      client_message_id: clientMessageId,
      created_at: respondedAt,
    });
    expect(message.error).toBeNull();

    const response = await serviceA.rpc("record_proactive_check_in_response", {
      p_senior_id: sharedSeniorId,
      p_client_message_id: clientMessageId,
      p_responded_at: respondedAt,
    });
    const workflow = await serviceA
      .from("proactive_check_in_workflows")
      .select("status, response_message_id")
      .eq("id", correlationWorkflowId)
      .single();

    expect(response.error).toBeNull();
    expect(response.data).toMatchObject({ result: "no_open_workflow" });
    expect(workflow.data).toMatchObject({
      status: "awaiting_initial_response",
      response_message_id: null,
    });
    const cleanup = await serviceA
      .from("proactive_check_in_workflows")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", correlationWorkflowId);
    expect(cleanup.error).toBeNull();
  });

  it("creates one Yellow case and records a repeated late response once", async () => {
    const timeoutWorkflowId = randomUUID();
    const timeoutJobId = randomUUID();
    const checkInId = randomUUID();
    const clientMessageId = `gate4-late-${randomUUID()}`;
    const initialSentAt = new Date(Date.now() - 10_800_000).toISOString();
    const retrySentAt = new Date(Date.now() - 3_600_000).toISOString();
    const now = new Date().toISOString();
    const workflow = await serviceA.from("proactive_check_in_workflows").insert({
      id: timeoutWorkflowId,
      schedule_id: scheduleId,
      senior_id: sharedSeniorId,
      status: "awaiting_retry_response",
      started_at: initialSentAt,
      initial_sent_at: initialSentAt,
      retry_sent_at: retrySentAt,
    });
    expect(workflow.error).toBeNull();
    const job = await serviceA.from("scheduled_jobs").insert({
      id: timeoutJobId,
      senior_id: sharedSeniorId,
      job_type: "follow_up",
      status: "running",
      scheduled_for: now,
      next_eligible_at: now,
      schedule_id: scheduleId,
      workflow_id: timeoutWorkflowId,
      stage: "final_deadline",
      idempotency_key: `gate4:${timeoutWorkflowId}:final_deadline`,
      claimed_by: "gate4-timeout-worker",
      claim_expires_at: new Date(Date.now() + 300_000).toISOString(),
      payload: {},
    });
    expect(job.error).toBeNull();

    const finalized = await serviceA.rpc("finalize_proactive_check_in_timeout", {
      p_job_id: timeoutJobId,
      p_worker_id: "gate4-timeout-worker",
      p_now: now,
    });
    expect(finalized.error).toBeNull();
    expect(finalized.data).toMatchObject({
      result: "caregiver_case_created",
      operational_risk: "yellow",
    });

    const checkIn = await serviceA.from("check_ins").insert({
      id: checkInId,
      senior_id: sharedSeniorId,
      status: "active",
      risk_before: "green",
      risk_after: "green",
    });
    expect(checkIn.error).toBeNull();
    const message = await serviceA.from("messages").insert({
      check_in_id: checkInId,
      senior_id: sharedSeniorId,
      sender: "senior",
      text: "Sorry, I saw this late. I am okay.",
      client_message_id: clientMessageId,
      created_at: now,
    });
    expect(message.error).toBeNull();

    const first = await serviceA.rpc("record_proactive_check_in_response", {
      p_senior_id: sharedSeniorId,
      p_client_message_id: clientMessageId,
      p_responded_at: now,
    });
    const duplicate = await serviceA.rpc("record_proactive_check_in_response", {
      p_senior_id: sharedSeniorId,
      p_client_message_id: clientMessageId,
      p_responded_at: now,
    });
    const [queue, events, senior] = await Promise.all([
      serviceA.from("caregiver_queue_items")
        .select("status, operational_risk, pattern_id, episode_key, change_from_usual, late_response_at")
        .eq("source_id", timeoutWorkflowId)
        .single(),
      serviceA.from("proactive_check_in_events")
        .select("id")
        .eq("workflow_id", timeoutWorkflowId)
        .eq("event_type", "senior_replied_after_escalation"),
      serviceA.from("seniors").select("risk_level").eq("id", sharedSeniorId).single(),
    ]);

    expect(first.data).toMatchObject({ result: "late_response_recorded" });
    expect(duplicate.data).toMatchObject({ result: "duplicate_response" });
    expect(queue.data).toMatchObject({
      status: "pending",
      operational_risk: "yellow",
      pattern_id: null,
      episode_key: `proactive_non_response:${timeoutWorkflowId}`,
    });
    expect(queue.data?.change_from_usual).toContain("Initial check-in sent at");
    expect(queue.data?.change_from_usual).toContain("gentle retry sent at");
    expect(queue.data?.late_response_at).not.toBeNull();
    expect(events.data).toHaveLength(1);
    expect(senior.data?.risk_level).toBe("green");
  });
});
