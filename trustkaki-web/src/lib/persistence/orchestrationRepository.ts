import "server-only";

import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
  OrchestrationResult,
} from "@/lib/agents/contracts";
import type { Json } from "@/lib/supabase/types";
import {
  AmbiguousMemoryCandidatesError,
  buildAutomaticMemoryCommands,
  buildManualBriefingPersistencePayload,
  buildOrchestrationPersistencePayload,
  InvalidInternalOrchestrationResultError,
  orchestrationArtifactId,
  orchestrationPersistenceCommandId,
  requireInternalOrchestrationResult,
  serializeOrchestrationRetryEnvelope,
  validateAutomaticMemoryCandidateSet,
  type ManualBriefingPersistencePayload,
  type OrchestrationPersistencePayload,
  type PersistenceMeta,
  type MemoryPersistenceSummary,
} from "./orchestration";
import {
  applyAutomaticSeniorContext,
  AutomaticContextRpcError,
} from "./memoryRepository";
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

async function upsertInboundMessage(
  client: TrustKakiClient,
  checkInId: string,
  message: OrchestrationPersistencePayload["inboundMessage"],
  seniorId: string
): Promise<{ id: string; createdAt: string; inserted: boolean }> {
  const row: TableInsert<"messages"> = {
    check_in_id: checkInId,
    senior_id: seniorId,
    sender: message.sender,
    text: message.text,
    agent_id: message.agentId ?? null,
    client_message_id: message.clientMessageId ?? null,
  };
  const { data: inserted, error: upsertError } = await client
    .from("messages")
    .upsert([row], {
      onConflict: "client_message_id",
      ignoreDuplicates: true,
    })
    .select("id, created_at")
    .maybeSingle();
  throwIfError(upsertError, "upsert inbound message");

  if (inserted) {
    return { id: inserted.id, createdAt: inserted.created_at, inserted: true };
  }

  const { data: existing, error: selectError } = await client
    .from("messages")
    .select("id, created_at")
    .eq("client_message_id", message.clientMessageId ?? "")
    .eq("senior_id", seniorId)
    .eq("sender", "senior")
    .maybeSingle();
  throwIfError(selectError, "select replayed inbound message");
  if (!existing) {
    throw new Error("replayed inbound message is not available for this senior");
  }
  return { id: existing.id, createdAt: existing.created_at, inserted: false };
}

function emptyMemorySummary(): MemoryPersistenceSummary {
  return {
    attempted: 0,
    accepted: 0,
    rejected: 0,
    duplicates: 0,
    failed: 0,
    failures: [],
  };
}

function classifyMemoryRpcFailure(error: unknown): "conflict" | "rpc_error" {
  return error instanceof AutomaticContextRpcError && error.code === "PT409"
    ? "conflict"
    : "rpc_error";
}

async function persistAutomaticMemory(args: {
  client: TrustKakiClient;
  seniorId: string;
  clientMessageId: string;
  persistedInboundId: string;
  persistedInboundCreatedAt: string;
  context: AgentRunContext;
  result: OrchestrateResponse;
}): Promise<MemoryPersistenceSummary> {
  const summary = emptyMemorySummary();
  const extractionTrace = args.result.traces.find(
    (trace) => trace.agentId === "context_memory" && trace.errorMessage
  );
  if (extractionTrace) {
    summary.failed += 1;
    summary.failures.push({ stage: "extraction", category: "provider_error" });
  }

  let commands;
  try {
    commands = buildAutomaticMemoryCommands({
      ...args,
      result: requireInternalOrchestrationResult(args.result),
    });
  } catch (error) {
    summary.failed += 1;
    summary.failures.push(
      error instanceof InvalidInternalOrchestrationResultError
        ? { stage: "extraction", category: "invalid_output" }
        : {
            stage: "policy",
            category:
              error instanceof AmbiguousMemoryCandidatesError
                ? "invalid_output"
                : "policy_error",
          }
    );
    return summary;
  }

  summary.attempted = commands.length;
  for (const command of commands) {
    try {
      const result = await applyAutomaticSeniorContext(args.client, command);
      if (result.duplicate) summary.duplicates += 1;
      if (result.accepted) summary.accepted += 1;
      else summary.rejected += 1;
    } catch (error) {
      summary.failed += 1;
      summary.failures.push({
        stage: "rpc",
        category: classifyMemoryRpcFailure(error),
      });
    }
  }
  return summary;
}

async function bindOrchestrationPersistence(args: {
  client: TrustKakiClient;
  seniorId: string;
  message: string;
  clientMessageId: string;
  context: AgentRunContext;
  result: OrchestrationResult;
  payload: OrchestrationPersistencePayload;
}): Promise<boolean> {
  const commandId = orchestrationPersistenceCommandId(args);
  const { data, error } = await args.client.rpc("bind_orchestration_persistence", {
    p_command_id: commandId,
    p_senior_id: args.seniorId,
    p_client_message_id: args.clientMessageId,
    p_payload_json: {
      version: 1,
      seniorId: args.seniorId,
      clientMessageId: args.clientMessageId,
      inboundText: args.message,
      context: args.context,
      orchestration: serializeOrchestrationRetryEnvelope(args.result),
      persistence: args.payload,
    } as unknown as Json,
  });
  throwIfError(error, "bind orchestration persistence");
  if (
    !data ||
    typeof data !== "object" ||
    Array.isArray(data) ||
    typeof (data as { duplicate?: unknown }).duplicate !== "boolean"
  ) {
    throw new Error("bind orchestration persistence: invalid RPC response");
  }
  return (data as { duplicate: boolean }).duplicate;
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
  observedAt: string,
  sourceMessageId: string
) {
  if (payload.signals.length === 0) return;

  const triageRunId =
    agentRuns.find((run) => run.agent_id === "triage")?.id ?? null;

  const { error } = await client.from("detected_signals").upsert(
    payload.signals.map((signal, index) => ({
      id: orchestrationArtifactId({ sourceMessageId, artifact: "signal", index }),
      check_in_id: checkInId,
      signal_type: signal.type,
      description: signal.description,
      severity: signal.severity,
      source_agent_run_id: triageRunId,
      observed_at: observedAt,
    })),
    { onConflict: "id", ignoreDuplicates: true }
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
  agentRuns: TableRow<"agent_runs">[],
  sourceMessageId: string
) {
  const policyRunId =
    agentRuns.find((run) => run.agent_id === "policy")?.id ?? null;
  const now = new Date().toISOString();

  if (payload.riskEvent.riskChange !== "none") {
    const { error } = await client.from("risk_events").upsert(
      {
        id: orchestrationArtifactId({ sourceMessageId, artifact: "risk_event" }),
        check_in_id: checkInId,
        senior_id: seniorId,
        previous_risk: payload.riskEvent.previousRisk,
        final_risk: payload.riskEvent.finalRisk,
        risk_change: payload.riskEvent.riskChange,
        policy_agent_run_id: policyRunId,
        reasoning: payload.riskEvent.reasoning,
      },
      { onConflict: "id", ignoreDuplicates: true }
    );
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
  payload: OrchestrationPersistencePayload,
  sourceMessageId: string
) {
  if (payload.alerts.length === 0) return;

  const { error } = await client.from("alerts").upsert(
    payload.alerts.map((alert, index) => ({
      id: orchestrationArtifactId({ sourceMessageId, artifact: "alert", index }),
      check_in_id: checkInId,
      senior_id: seniorId,
      signal_type: alert.type,
      message: alert.message,
      severity: alert.severity,
      urgent: alert.urgent,
      reason: alert.reason ?? null,
    })),
    { onConflict: "id", ignoreDuplicates: true }
  );
  throwIfError(error, "insert policy alerts");
}

async function persistBrief(
  client: TrustKakiClient,
  seniorId: string,
  checkInId: string,
  brief: OrchestrationPersistencePayload["brief"] | ManualBriefingPersistencePayload["brief"],
  agentRuns: TableRow<"agent_runs">[],
  sourceMessageId?: string
) {
  if (!brief) return;

  const briefingRunId =
    agentRuns.find((run) => run.agent_id === "briefing")?.id ?? null;

  const row = {
    ...(sourceMessageId
      ? { id: orchestrationArtifactId({ sourceMessageId, artifact: "brief" }) }
      : {}),
    check_in_id: checkInId,
    senior_id: seniorId,
    trigger: brief.trigger,
    for_caregiver: brief.briefing.forCaregiver,
    for_aac_volunteer: brief.briefing.forAACVolunteer,
    overall_risk: brief.briefing.overallRisk,
    key_concerns: brief.briefing.keyConcerns,
    recommended_actions: brief.briefing.recommendedActions,
    source_agent_run_id: briefingRunId,
  };
  const { error } = sourceMessageId
    ? await client.from("briefs").upsert(row, {
        onConflict: "id",
        ignoreDuplicates: true,
      })
    : await client.from("briefs").insert(row);
  throwIfError(error, "insert brief");
}

export async function persistOrchestrationResult(args: {
  seniorId: string;
  message: string;
  clientMessageId: string;
  context: AgentRunContext;
  result: OrchestrationResult;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const result = requireInternalOrchestrationResult(args.result);
  validateAutomaticMemoryCandidateSet(result.contextMemoryCandidates);
  const payload = buildOrchestrationPersistencePayload(args);
  await bindOrchestrationPersistence({ ...args, client, result, payload });
  const checkIn = await getOrCreateActiveCheckIn(client, args.seniorId, args.context);

  const inbound = await upsertInboundMessage(
    client,
    checkIn.id,
    payload.inboundMessage,
    args.seniorId
  );
  const memory = await persistAutomaticMemory({
    client,
    seniorId: args.seniorId,
    clientMessageId: args.clientMessageId,
    persistedInboundId: inbound.id,
    persistedInboundCreatedAt: inbound.createdAt,
    context: args.context,
    result: args.result,
  });
  await upsertMessages(client, checkIn.id, payload.outboundMessages, args.seniorId);
  const agentRuns = await upsertAgentRuns(client, checkIn.id, payload.agentRuns);
  await persistSignals(
    client,
    checkIn.id,
    payload,
    agentRuns,
    observedAtFromContext(args.clientMessageId, args.context),
    inbound.id
  );
  await persistRiskEvent(client, args.seniorId, checkIn.id, payload, agentRuns, inbound.id);
  await persistAlerts(client, args.seniorId, checkIn.id, payload, inbound.id);
  await persistBrief(client, args.seniorId, checkIn.id, payload.brief, agentRuns, inbound.id);
  await runPatternWatchForSenior(client, args.seniorId);

  return { ...supabaseMeta(), replayed: !inbound.inserted || undefined, memory };
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
