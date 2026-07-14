import "server-only";

import { z } from "zod";
import type {
  CaregiverActionType,
  ContactOutcome,
  EscalationDestination,
  QueueStatus,
} from "@/lib/supabase/types";
import { createTrustKakiUserClient } from "@/lib/supabase/server";
import type { PersistenceMeta } from "./orchestration";

const resultSchema = z.object({
  queue_item_id: z.string(),
  senior_id: z.string(),
  actor_caregiver_id: z.string(),
  assigned_caregiver_id: z.string().nullable(),
  previous_status: z.enum([
    "pending",
    "acknowledged",
    "followed_up",
    "snoozed",
    "escalated",
    "resolved",
  ]),
  resulting_status: z.enum([
    "pending",
    "acknowledged",
    "followed_up",
    "snoozed",
    "escalated",
    "resolved",
  ]),
  queue_updated_at: z.string(),
  command_id: z.string(),
  duplicate: z.boolean(),
});

export class CaregiverCaseConflictError extends Error {
  constructor() {
    super("Caregiver case changed");
    this.name = "CaregiverCaseConflictError";
  }
}

function localDemoMeta(): PersistenceMeta {
  return {
    mode: "local_demo",
    configured: false,
    persisted: false,
    reason: "Supabase env vars are not configured. Caregiver action was not persisted.",
  };
}

export interface CaregiverQueueActionResult {
  queueItemId: string | null;
  seniorId: string | null;
  actorCaregiverId: string | null;
  assignedCaregiverId: string | null;
  previousStatus: QueueStatus | null;
  resultingStatus: QueueStatus | null;
  queueUpdatedAt: string | null;
  commandId: string | null;
  duplicate: boolean;
  persistence: PersistenceMeta;
}

export async function recordCaregiverQueueAction(args: {
  accessToken: string;
  queueItemId: string;
  commandId: string;
  expectedUpdatedAt: string;
  actionType: CaregiverActionType;
  outcomeType?: ContactOutcome | null;
  note?: string | null;
  assignedCaregiverId?: string | null;
  snoozedUntil?: string | null;
  escalationDestination?: EscalationDestination | null;
}): Promise<CaregiverQueueActionResult> {
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) {
    return {
      queueItemId: null,
      seniorId: null,
      actorCaregiverId: null,
      assignedCaregiverId: null,
      previousStatus: null,
      resultingStatus: null,
      queueUpdatedAt: null,
      commandId: null,
      duplicate: false,
      persistence: localDemoMeta(),
    };
  }

  if (
    args.actionType === "escalate" &&
    (!args.escalationDestination || (args.note?.trim().length ?? 0) < 10)
  ) {
    throw new Error("Escalation destination and reason are required");
  }

  type StandardRpcArgs = {
    p_queue_item_id: string;
    p_action_type: CaregiverActionType;
    p_command_id: string;
    p_expected_updated_at: string;
    p_outcome_type: ContactOutcome | null;
    p_note: string | null;
    p_assigned_caregiver_id: string | null;
    p_snoozed_until: string | null;
  };
  type EscalationRpcArgs = {
    p_queue_item_id: string;
    p_command_id: string;
    p_expected_updated_at: string;
    p_escalation_destination: EscalationDestination;
    p_note: string;
  };
  // supabase-js 2.110 mis-infers defaulted RPC arguments as `never` for this
  // hand-maintained database type; the response is still validated below.
  const rpcClient = client as unknown as {
    rpc: (
      name: "record_caregiver_queue_action" | "escalate_caregiver_queue_case",
      payload: StandardRpcArgs | EscalationRpcArgs
    ) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
  };
  const response = args.actionType === "escalate"
    ? await rpcClient.rpc("escalate_caregiver_queue_case", {
        p_queue_item_id: args.queueItemId,
        p_command_id: args.commandId,
        p_expected_updated_at: args.expectedUpdatedAt,
        p_escalation_destination: args.escalationDestination as EscalationDestination,
        p_note: args.note as string,
      })
    : await rpcClient.rpc("record_caregiver_queue_action", {
        p_queue_item_id: args.queueItemId,
        p_action_type: args.actionType,
        p_command_id: args.commandId,
        p_expected_updated_at: args.expectedUpdatedAt,
        p_outcome_type: args.outcomeType ?? null,
        p_note: args.note ?? null,
        p_assigned_caregiver_id: args.assignedCaregiverId ?? null,
        p_snoozed_until: args.snoozedUntil ?? null,
      });
  const { data, error } = response;
  if (error) {
    if (error.code === "PT409") throw new CaregiverCaseConflictError();
    throw new Error("record caregiver queue action failed");
  }

  const parsed = resultSchema.safeParse(data);
  if (!parsed.success) throw new Error("record caregiver queue action failed");

  return {
    queueItemId: parsed.data.queue_item_id,
    seniorId: parsed.data.senior_id,
    actorCaregiverId: parsed.data.actor_caregiver_id,
    assignedCaregiverId: parsed.data.assigned_caregiver_id,
    previousStatus: parsed.data.previous_status,
    resultingStatus: parsed.data.resulting_status,
    queueUpdatedAt: parsed.data.queue_updated_at,
    commandId: parsed.data.command_id,
    duplicate: parsed.data.duplicate,
    persistence: { mode: "supabase", configured: true, persisted: true },
  };
}
