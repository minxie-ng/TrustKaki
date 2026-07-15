import "server-only";

import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
} from "@/lib/agents/contracts";
import {
  buildManualBriefingPersistencePayload,
  buildOrchestrationPersistencePayload,
  type ManualBriefingPersistencePayload,
  type OrchestrationPersistencePayload,
  type PersistenceMeta,
} from "./orchestration";
import { runPatternWatchForSenior } from "./patternRepository";
import {
  getClient,
  localDemoMeta,
  supabaseMeta,
  type TableInsert,
  type TableRow,
  type TrustKakiClient,
  throwIfError,
} from "./persistenceSupport";

function asMetadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

export async function getOrCreateActiveCheckIn(
  client: TrustKakiClient,
  seniorId: string,
  context: AgentRunContext
): Promise<TableRow<"check_ins">> {
  const { data: existing, error: selectError } = await client
    .from("check_ins")
    .select("*")
    .eq("senior_id", seniorId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(selectError, "select active check-in");

  if (existing) return existing;

  const { data, error } = await client
    .from("check_ins")
    .insert({
      senior_id: seniorId,
      status: "active",
      risk_before: context.currentRiskLevel,
      risk_after: context.currentRiskLevel,
    })
    .select("*")
    .single();
  throwIfError(error, "insert active check-in");
  return data;
}

async function upsertMessages(
  client: TrustKakiClient,
  checkInId: string,
  messages: OrchestrationPersistencePayload["outboundMessages"],
  seniorId: string
) {
  if (messages.length === 0) return;

  const inserts: TableInsert<"messages">[] = messages.map((message) => ({
    check_in_id: checkInId,
    senior_id: seniorId,
    sender: message.sender,
    text: message.text,
    agent_id: message.agentId ?? null,
    client_message_id: message.clientMessageId ?? null,
  }));

  const withClientId = inserts.filter((message) => message.client_message_id);
  const withoutClientId = inserts.filter((message) => !message.client_message_id);

  if (withClientId.length > 0) {
    const { error } = await client
      .from("messages")
      .upsert(withClientId, {
        onConflict: "client_message_id",
        ignoreDuplicates: true,
      });
    throwIfError(error, "upsert messages with client IDs");
  }

  if (withoutClientId.length > 0) {
    const { error } = await client.from("messages").insert(withoutClientId);
    throwIfError(error, "insert messages without client IDs");
  }
}

export async function upsertAgentRuns(
  client: TrustKakiClient,
  checkInId: string,
  runs: OrchestrationPersistencePayload["agentRuns"]
): Promise<TableRow<"agent_runs">[]> {
  if (runs.length === 0) return [];

  const inserts: TableInsert<"agent_runs">[] = runs.map((run) => ({
    check_in_id: checkInId,
    agent_id: run.agentId,
    agent_name: run.agentName,
    trace_id: run.traceId,
    input: run.input,
    reasoning: run.reasoning,
    output: run.output,
    output_json: run.outputJson as TableInsert<"agent_runs">["output_json"],
    tags: run.tags,
    duration_ms: run.durationMs ?? null,
    model_used: run.modelUsed ?? null,
    fallback: run.fallback,
    input_summary: run.inputSummary ?? null,
    output_summary: run.outputSummary ?? null,
    state_changes: run.stateChanges ?? [],
    error_message: run.errorMessage ?? null,
  }));

  const { data, error } = await client
    .from("agent_runs")
    .upsert(inserts, { onConflict: "trace_id" })
    .select("*");
  throwIfError(error, "upsert agent runs");
  return data ?? [];
}

async function persistSignals(
  client: TrustKakiClient,
  checkInId: string,
  payload: OrchestrationPersistencePayload,
  agentRuns: TableRow<"agent_runs">[],
  observedAt: string
) {
  if (payload.signals.length === 0) return;

  const triageRunId =
    agentRuns.find((run) => run.agent_id === "triage")?.id ?? null;

  const { error } = await client.from("detected_signals").insert(
    payload.signals.map((signal) => ({
      check_in_id: checkInId,
      signal_type: signal.type,
      description: signal.description,
      severity: signal.severity,
      source_agent_run_id: triageRunId,
      observed_at: observedAt,
    }))
  );
  throwIfError(error, "insert detected signals");
}

function observedAtFromContext(clientMessageId: string, context: AgentRunContext): string {
  const matching = context.messages.find((msg) => msg.id === clientMessageId);
  return matching?.timestamp ?? new Date().toISOString();
}

async function persistRiskEvent(
  client: TrustKakiClient,
  seniorId: string,
  checkInId: string,
  payload: OrchestrationPersistencePayload,
  agentRuns: TableRow<"agent_runs">[]
) {
  const policyRunId =
    agentRuns.find((run) => run.agent_id === "policy")?.id ?? null;
  const now = new Date().toISOString();

  if (payload.riskEvent.riskChange !== "none") {
    const { error } = await client.from("risk_events").insert({
      check_in_id: checkInId,
      senior_id: seniorId,
      previous_risk: payload.riskEvent.previousRisk,
      final_risk: payload.riskEvent.finalRisk,
      risk_change: payload.riskEvent.riskChange,
      policy_agent_run_id: policyRunId,
      reasoning: payload.riskEvent.reasoning,
    });
    throwIfError(error, "insert policy risk event");
  }

  const { error: checkInError } = await client
    .from("check_ins")
    .update({
      risk_after: payload.riskEvent.finalRisk,
      summary: payload.brief?.briefing.forCaregiver ?? null,
    })
    .eq("id", checkInId);
  throwIfError(checkInError, "update check-in risk");

  const { error: seniorError } = await client
    .from("seniors")
    .update({
      risk_level: payload.riskEvent.finalRisk,
      last_check_in_at: now,
    })
    .eq("id", seniorId);
  throwIfError(seniorError, "update senior risk");
}

async function persistAlerts(
  client: TrustKakiClient,
  seniorId: string,
  checkInId: string,
  payload: OrchestrationPersistencePayload
) {
  if (payload.alerts.length === 0) return;

  const { error } = await client.from("alerts").insert(
    payload.alerts.map((alert) => ({
      check_in_id: checkInId,
      senior_id: seniorId,
      signal_type: alert.type,
      message: alert.message,
      severity: alert.severity,
      urgent: alert.urgent,
      reason: alert.reason ?? null,
    }))
  );
  throwIfError(error, "insert policy alerts");
}

async function persistBrief(
  client: TrustKakiClient,
  seniorId: string,
  checkInId: string,
  brief: OrchestrationPersistencePayload["brief"] | ManualBriefingPersistencePayload["brief"],
  agentRuns: TableRow<"agent_runs">[]
) {
  if (!brief) return;

  const briefingRunId =
    agentRuns.find((run) => run.agent_id === "briefing")?.id ?? null;

  const { error } = await client.from("briefs").insert({
    check_in_id: checkInId,
    senior_id: seniorId,
    trigger: brief.trigger,
    for_caregiver: brief.briefing.forCaregiver,
    for_aac_volunteer: brief.briefing.forAACVolunteer,
    overall_risk: brief.briefing.overallRisk,
    key_concerns: brief.briefing.keyConcerns,
    recommended_actions: brief.briefing.recommendedActions,
    source_agent_run_id: briefingRunId,
  });
  throwIfError(error, "insert brief");
}

export async function persistOrchestrationResult(args: {
  seniorId: string;
  message: string;
  clientMessageId: string;
  context: AgentRunContext;
  result: OrchestrateResponse;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const checkIn = await getOrCreateActiveCheckIn(client, args.seniorId, args.context);
  const payload = buildOrchestrationPersistencePayload(args);

  await upsertMessages(client, checkIn.id, [payload.inboundMessage], args.seniorId);
  await upsertMessages(client, checkIn.id, payload.outboundMessages, args.seniorId);
  const agentRuns = await upsertAgentRuns(client, checkIn.id, payload.agentRuns);
  await persistSignals(
    client,
    checkIn.id,
    payload,
    agentRuns,
    observedAtFromContext(args.clientMessageId, args.context)
  );
  await persistRiskEvent(client, args.seniorId, checkIn.id, payload, agentRuns);
  await persistAlerts(client, args.seniorId, checkIn.id, payload);
  await persistBrief(client, args.seniorId, checkIn.id, payload.brief, agentRuns);
  await runPatternWatchForSenior(client, args.seniorId);

  return supabaseMeta();
}

export async function hasPersistedMessageClientId(
  clientMessageId: string
): Promise<boolean> {
  const client = getClient();
  if (!client) return false;

  const { data, error } = await client
    .from("messages")
    .select("id")
    .eq("client_message_id", clientMessageId)
    .limit(1)
    .maybeSingle();
  throwIfError(error, "select message by client ID");

  return Boolean(data);
}

export async function recordOutboundMessageMetadata(args: {
  externalPlatform: "whatsapp" | "telegram";
  clientMessageId: string;
  externalMessageId: string;
  externalMetadata?: Record<string, unknown>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const { error } = await client
    .from("messages")
    .update({
      external_platform: args.externalPlatform,
      external_message_id: args.externalMessageId,
      external_metadata: args.externalMetadata ?? {},
    })
    .eq("client_message_id", args.clientMessageId);
  throwIfError(error, "update outbound message metadata");

  return supabaseMeta();
}

export async function recordInboundMessageMetadata(args: {
  externalPlatform: "whatsapp" | "telegram";
  clientMessageId: string;
  externalMessageId: string;
  externalMetadata?: Record<string, unknown>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const { error } = await client
    .from("messages")
    .update({
      external_platform: args.externalPlatform,
      external_message_id: args.externalMessageId,
      external_metadata: args.externalMetadata ?? {},
    })
    .eq("client_message_id", args.clientMessageId);
  throwIfError(error, "update inbound message metadata");

  return supabaseMeta();
}

export async function recordWhatsAppDeliveryStatus(args: {
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  statusAt: string;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const { data: message, error: selectError } = await client
    .from("messages")
    .select("id, external_metadata")
    .eq("external_platform", "whatsapp")
    .eq("external_message_id", args.externalMessageId)
    .limit(1)
    .maybeSingle();
  throwIfError(selectError, "select outbound WhatsApp message");
  if (!message) {
    throw new Error("Outbound WhatsApp message metadata is not available yet");
  }

  const metadata = asMetadataObject(message.external_metadata);
  const current = asMetadataObject(metadata.whatsapp_delivery);
  const currentAt =
    typeof current.updated_at === "string" ? Date.parse(current.updated_at) : Number.NaN;
  const incomingAt = Date.parse(args.statusAt);
  if (Number.isFinite(currentAt) && Number.isFinite(incomingAt) && currentAt > incomingAt) {
    return supabaseMeta();
  }

  const { error: updateError } = await client
    .from("messages")
    .update({
      external_metadata: {
        ...metadata,
        whatsapp_delivery: {
          status: args.status,
          updated_at: args.statusAt,
        },
      },
    })
    .eq("id", message.id);
  throwIfError(updateError, "update outbound WhatsApp delivery status");

  return supabaseMeta();
}

export async function persistManualBriefingResult(args: {
  seniorId: string;
  context: AgentRunContext;
  result: AgentRunResult<BriefingOutput>;
  briefing: BriefingOutput;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const checkIn = await getOrCreateActiveCheckIn(client, args.seniorId, args.context);
  const payload = buildManualBriefingPersistencePayload(
    args.context,
    args.result,
    args.briefing
  );
  const agentRuns = await upsertAgentRuns(client, checkIn.id, [payload.agentRun]);
  await persistBrief(client, args.seniorId, checkIn.id, payload.brief, agentRuns);

  return supabaseMeta();
}
