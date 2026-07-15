import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  proactiveCheckInStageSchema,
  proactiveCheckInWorkflowStatusSchema,
  type ProactiveCheckInScheduleOverview,
  type ProactiveCheckInScheduleView,
} from "@/lib/checkins/contracts";
import {
  createTrustKakiServiceClient,
  createTrustKakiUserClient,
} from "@/lib/supabase/server";

const uuidSchema = z.string().uuid();
const timestampSchema = z.string().datetime({ offset: true });
const hhmmSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);

const scheduleRowSchema = z.object({
  id: uuidSchema,
  senior_id: uuidSchema,
  platform: z.enum(["telegram", "whatsapp"]),
  local_send_time: z.string(),
  timezone: z.string().min(1),
  active_weekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  initial_response_minutes: z.number().int().min(1).max(1440),
  retry_response_minutes: z.number().int().min(1).max(1440),
  initial_message_template: z.string().min(1),
  retry_message_template: z.string().min(1),
  enabled: z.boolean(),
  paused_at: timestampSchema.nullable(),
  pause_reason: z.string().nullable(),
  next_run_at: timestampSchema,
  last_run_at: timestampSchema.nullable(),
  updated_at: timestampSchema,
});

const scheduleCommandSchema = z.object({
  seniorId: uuidSchema,
  commandId: uuidSchema,
  action: z.enum(["configure", "pause", "resume", "manual_run"]),
  platform: z.enum(["telegram", "whatsapp"]),
  localSendTime: hhmmSchema,
  timezone: z.string().trim().min(1).max(100),
  activeWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7),
  initialResponseMinutes: z.number().int().min(1).max(1440),
  retryResponseMinutes: z.number().int().min(1).max(1440),
  initialMessageTemplate: z.string().trim().min(1).max(1000),
  retryMessageTemplate: z.string().trim().min(1).max(1000),
  reason: z.string().trim().min(10).max(500).nullable(),
  now: timestampSchema,
});

const scheduleCommandResultSchema = z.object({
  schedule_id: uuidSchema,
  workflow_id: uuidSchema.nullable(),
  duplicate: z.boolean(),
});

const claimedJobSchema = z.object({
  id: uuidSchema,
  senior_id: uuidSchema,
  schedule_id: uuidSchema,
  workflow_id: uuidSchema,
  stage: proactiveCheckInStageSchema,
  scheduled_for: timestampSchema,
  attempt_count: z.number().int().nonnegative(),
  claimed_by: z.string().min(1),
  claim_expires_at: timestampSchema,
});

const completionResultSchema = z.object({
  job_id: uuidSchema,
  next_job_id: uuidSchema,
  duplicate: z.boolean(),
});

const workflowResultSchema = z.object({
  result: z.string().min(1),
  workflow_id: uuidSchema.optional(),
  queue_item_id: uuidSchema.nullable().optional(),
  operational_risk: z.literal("yellow").optional(),
});

type RpcClient = {
  rpc: (
    name: string,
    payload: Record<string, unknown>
  ) => Promise<{ data: unknown; error: { code?: string } | null }>;
};

export type ProactiveCheckInSchedule = ProactiveCheckInScheduleView;

export type ScheduleCommand = z.infer<typeof scheduleCommandSchema>;
export type ClaimedProactiveJob = z.infer<typeof claimedJobSchema>;

export interface ProactiveProcessingSchedule {
  id: string;
  platform: "telegram" | "whatsapp";
  timezone: string;
  initialResponseMinutes: number;
  retryResponseMinutes: number;
  initialMessageTemplate: string;
  retryMessageTemplate: string;
  paused: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
}

export class ProactiveCheckInConflictError extends Error {
  constructor() {
    super("Proactive check-in state changed");
    this.name = "ProactiveCheckInConflictError";
  }
}

function mapSchedule(value: unknown): ProactiveCheckInSchedule {
  const row = scheduleRowSchema.parse(value);
  return {
    id: row.id,
    seniorId: row.senior_id,
    platform: row.platform,
    localSendTime: row.local_send_time.slice(0, 5),
    timezone: row.timezone,
    activeWeekdays: row.active_weekdays,
    initialResponseMinutes: row.initial_response_minutes,
    retryResponseMinutes: row.retry_response_minutes,
    initialMessageTemplate: row.initial_message_template,
    retryMessageTemplate: row.retry_message_template,
    enabled: row.enabled,
    pausedAt: row.paused_at,
    pauseReason: row.pause_reason,
    nextRunAt: row.next_run_at,
    lastRunAt: row.last_run_at,
    updatedAt: row.updated_at,
  };
}

const workflowOverviewSchema = z.object({
  status: proactiveCheckInWorkflowStatusSchema,
  initial_sent_at: timestampSchema.nullable(),
  retry_sent_at: timestampSchema.nullable(),
});

const failedJobOverviewSchema = z.object({
  last_error_category: z.string().min(1),
  updated_at: timestampSchema,
});

function requireServiceClient(): RpcClient {
  const client = createTrustKakiServiceClient();
  if (!client) throw new Error("Proactive check-in persistence unavailable");
  return client as unknown as RpcClient;
}

function requireDataClient(): SupabaseClient {
  const client = createTrustKakiServiceClient();
  if (!client) throw new Error("Proactive check-in persistence unavailable");
  return client;
}

async function serviceRpc(name: string, payload: Record<string, unknown>) {
  const { data, error } = await requireServiceClient().rpc(name, payload);
  if (error?.code === "PT409") throw new ProactiveCheckInConflictError();
  if (error) throw new Error("Proactive check-in command failed");
  return data;
}

export async function readScheduleForSenior(args: {
  accessToken: string;
  seniorId: string;
}): Promise<ProactiveCheckInSchedule | null> {
  const seniorId = uuidSchema.parse(args.seniorId);
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) throw new Error("Proactive check-in persistence unavailable");
  const { data, error } = await client
    .from("proactive_check_in_schedules")
    .select(
      "id, senior_id, platform, local_send_time, timezone, active_weekdays, initial_response_minutes, retry_response_minutes, initial_message_template, retry_message_template, enabled, paused_at, pause_reason, next_run_at, last_run_at, updated_at"
    )
    .eq("senior_id", seniorId)
    .maybeSingle();
  if (error) throw new Error("Proactive check-in schedule read failed");
  return data ? mapSchedule(data) : null;
}

export async function readScheduleOverviewForSenior(args: {
  accessToken: string;
  seniorId: string;
}): Promise<ProactiveCheckInScheduleOverview> {
  const seniorId = uuidSchema.parse(args.seniorId);
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) throw new Error("Proactive check-in persistence unavailable");

  const { data: rawSchedule, error: scheduleError } = await client
    .from("proactive_check_in_schedules")
    .select(
      "id, senior_id, platform, local_send_time, timezone, active_weekdays, initial_response_minutes, retry_response_minutes, initial_message_template, retry_message_template, enabled, paused_at, pause_reason, next_run_at, last_run_at, updated_at"
    )
    .eq("senior_id", seniorId)
    .maybeSingle();
  if (scheduleError) throw new Error("Proactive check-in schedule read failed");
  if (!rawSchedule) {
    return { schedule: null, state: "not_configured", lastSendAt: null, lastFailure: null };
  }

  const schedule = mapSchedule(rawSchedule);
  const [{ data: rawWorkflow, error: workflowError }, { data: rawFailure, error: failureError }] =
    await Promise.all([
      client
        .from("proactive_check_in_workflows")
        .select("status, initial_sent_at, retry_sent_at")
        .eq("schedule_id", schedule.id)
        .order("started_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      client
        .from("scheduled_jobs")
        .select("last_error_category, updated_at")
        .eq("schedule_id", schedule.id)
        .eq("status", "failed")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
  if (workflowError || failureError) {
    throw new Error("Proactive check-in overview read failed");
  }
  const workflow = rawWorkflow ? workflowOverviewSchema.parse(rawWorkflow) : null;
  const failure = rawFailure ? failedJobOverviewSchema.parse(rawFailure) : null;
  return {
    schedule,
    state: schedule.pausedAt ? "paused" : workflow?.status ?? "scheduled",
    lastSendAt: workflow?.retry_sent_at ?? workflow?.initial_sent_at ?? schedule.lastRunAt,
    lastFailure: failure
      ? { category: failure.last_error_category, occurredAt: failure.updated_at }
      : null,
  };
}

export async function saveScheduleCommand(
  accessToken: string,
  rawCommand: ScheduleCommand
) {
  const command = scheduleCommandSchema.parse(rawCommand);
  const client = createTrustKakiUserClient(accessToken);
  if (!client) throw new Error("Proactive check-in persistence unavailable");
  const { data, error } = await (client as unknown as RpcClient).rpc(
    "manage_proactive_check_in_schedule",
    {
      p_senior_id: command.seniorId,
      p_command_id: command.commandId,
      p_action: command.action,
      p_platform: command.platform,
      p_local_send_time: command.localSendTime,
      p_timezone: command.timezone,
      p_active_weekdays: command.activeWeekdays,
      p_initial_response_minutes: command.initialResponseMinutes,
      p_retry_response_minutes: command.retryResponseMinutes,
      p_initial_message_template: command.initialMessageTemplate,
      p_retry_message_template: command.retryMessageTemplate,
      p_reason: command.reason,
      p_now: command.now,
    }
  );
  if (error?.code === "PT409") throw new ProactiveCheckInConflictError();
  if (error) throw new Error("Proactive check-in schedule command failed");
  const result = scheduleCommandResultSchema.parse(data);
  return {
    scheduleId: result.schedule_id,
    workflowId: result.workflow_id,
    duplicate: result.duplicate,
  };
}

export async function enqueueDueSchedules(args: { limit: number; now: string }) {
  const limit = z.number().int().min(1).max(100).parse(args.limit);
  const now = timestampSchema.parse(args.now);
  const data = await serviceRpc("enqueue_due_proactive_check_ins", {
    p_limit: limit,
    p_now: now,
  });
  return z.number().int().nonnegative().parse(data);
}

export async function claimDueJobs(args: {
  limit: number;
  workerId: string;
  now: string;
}): Promise<ClaimedProactiveJob[]> {
  const limit = z.number().int().min(1).max(100).parse(args.limit);
  const workerId = z.string().trim().min(1).max(100).parse(args.workerId);
  const now = timestampSchema.parse(args.now);
  const data = await serviceRpc("claim_due_proactive_check_in_jobs", {
    p_limit: limit,
    p_worker_id: workerId,
    p_now: now,
  });
  return z.array(claimedJobSchema).parse(data);
}

export async function readProcessingSchedule(
  scheduleId: string
): Promise<ProactiveProcessingSchedule> {
  const { data, error } = await requireDataClient()
    .from("proactive_check_in_schedules")
    .select(
      "id, platform, timezone, initial_response_minutes, retry_response_minutes, initial_message_template, retry_message_template, paused_at"
    )
    .eq("id", uuidSchema.parse(scheduleId))
    .single();
  if (error) throw new Error("Proactive check-in processing schedule read failed");
  const row = z
    .object({
      id: uuidSchema,
      platform: z.enum(["telegram", "whatsapp"]),
      timezone: z.string().min(1),
      initial_response_minutes: z.number().int().positive(),
      retry_response_minutes: z.number().int().positive(),
      initial_message_template: z.string().min(1),
      retry_message_template: z.string().min(1),
      paused_at: timestampSchema.nullable(),
    })
    .parse(data);
  return {
    id: row.id,
    platform: row.platform,
    timezone: row.timezone,
    initialResponseMinutes: row.initial_response_minutes,
    retryResponseMinutes: row.retry_response_minutes,
    initialMessageTemplate: row.initial_message_template,
    retryMessageTemplate: row.retry_message_template,
    paused: row.paused_at !== null,
    quietHoursStart: "22:00",
    quietHoursEnd: "07:00",
  };
}

export async function findAcceptedOutbound(
  clientMessageId: string
): Promise<{ externalMessageId: string } | null> {
  const { data, error } = await requireDataClient()
    .from("messages")
    .select("external_message_id")
    .eq(
      "client_message_id",
      z.string().trim().min(1).max(200).parse(clientMessageId)
    )
    .eq("external_platform", "telegram")
    .not("external_message_id", "is", null)
    .maybeSingle();
  if (error) throw new Error("Proactive outbound acceptance lookup failed");
  const externalMessageId = (data as { external_message_id: string | null } | null)
    ?.external_message_id;
  return externalMessageId ? { externalMessageId } : null;
}

export async function recordProviderAcceptance(args: {
  seniorId: string;
  clientMessageId: string;
  text: string;
  externalMessageId: string;
  acceptedAt: string;
}): Promise<void> {
  const seniorId = uuidSchema.parse(args.seniorId);
  const client = requireDataClient();
  const { data: existingCheckIn, error: checkInError } = await client
    .from("check_ins")
    .select("id")
    .eq("senior_id", seniorId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (checkInError) throw new Error("Proactive outbound check-in lookup failed");
  let checkIn = existingCheckIn;

  if (!checkIn) {
    const { data: senior, error: seniorError } = await client
      .from("seniors")
      .select("risk_level")
      .eq("id", seniorId)
      .single();
    if (seniorError) throw new Error("Proactive outbound senior lookup failed");
    const created = await client
      .from("check_ins")
      .insert({
        senior_id: seniorId,
        status: "active",
        risk_before: senior.risk_level,
        risk_after: senior.risk_level,
      })
      .select("id")
      .single();
    if (created.error) throw new Error("Proactive outbound check-in creation failed");
    checkIn = created.data;
  }

  const { error } = await client.from("messages").upsert(
    {
      check_in_id: checkIn.id,
      senior_id: seniorId,
      sender: "trustkaki",
      text: z.string().trim().min(1).max(1000).parse(args.text),
      client_message_id: z.string().trim().min(1).max(200).parse(args.clientMessageId),
      external_platform: "telegram",
      external_message_id: z.string().trim().min(1).max(200).parse(args.externalMessageId),
      external_metadata: { delivery_state: "provider_accepted", source: "proactive_check_in" },
      created_at: timestampSchema.parse(args.acceptedAt),
    },
    { onConflict: "client_message_id" }
  );
  if (error) throw new Error("Proactive outbound acceptance persistence failed");
}

export async function completeJob(args: {
  jobId: string;
  workerId: string;
  nextStage: "initial_deadline" | "retry_send" | "final_deadline";
  nextScheduledFor: string;
  clientMessageId: string;
  now: string;
}) {
  const data = await serviceRpc("advance_proactive_check_in_job", {
    p_job_id: uuidSchema.parse(args.jobId),
    p_worker_id: z.string().trim().min(1).max(100).parse(args.workerId),
    p_next_stage: z
      .enum(["initial_deadline", "retry_send", "final_deadline"])
      .parse(args.nextStage),
    p_next_scheduled_for: timestampSchema.parse(args.nextScheduledFor),
    p_client_message_id: z.string().trim().min(1).max(200).parse(args.clientMessageId),
    p_now: timestampSchema.parse(args.now),
  });
  return completionResultSchema.parse(data);
}

export async function retryJob(args: {
  jobId: string;
  workerId: string;
  errorCategory: string;
  nextEligibleAt: string;
  now: string;
}): Promise<void> {
  const data = await serviceRpc("retry_proactive_check_in_job", {
    p_job_id: uuidSchema.parse(args.jobId),
    p_worker_id: z.string().trim().min(1).max(100).parse(args.workerId),
    p_error_category: z.string().trim().min(1).max(80).parse(args.errorCategory),
    p_next_eligible_at: timestampSchema.parse(args.nextEligibleAt),
    p_now: timestampSchema.parse(args.now),
  });
  z.null().parse(data);
}

export async function recordSeniorResponse(args: {
  seniorId: string;
  clientMessageId: string;
  respondedAt: string;
}) {
  const data = await serviceRpc("record_proactive_check_in_response", {
    p_senior_id: uuidSchema.parse(args.seniorId),
    p_client_message_id: z.string().trim().min(1).max(200).parse(args.clientMessageId),
    p_responded_at: timestampSchema.parse(args.respondedAt),
  });
  return workflowResultSchema.parse(data);
}

export async function finalizeTimeout(args: {
  jobId: string;
  workerId: string;
  now: string;
}) {
  const data = await serviceRpc("finalize_proactive_check_in_timeout", {
    p_job_id: uuidSchema.parse(args.jobId),
    p_worker_id: z.string().trim().min(1).max(100).parse(args.workerId),
    p_now: timestampSchema.parse(args.now),
  });
  return workflowResultSchema.parse(data);
}
