import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { uncleTan } from "@/data/demo";
import type {
  AgentRunResult,
  BriefingOutput,
  TriageOutput,
  TriageTimelineOutput,
} from "@/lib/agents/contracts";
import type { AuthenticatedCaregiver } from "@/lib/auth/session";
import type { AgentTrace, DashboardData, Message } from "@/lib/types";
import type {
  CaregiverActionItem,
  ContactOutcome,
  FollowUpQueueItem,
  PatternDetail,
  PatternEvidenceItem,
  PatternType,
} from "@/lib/types";
import { getPersistenceStatus, type PersistenceStatus } from "@/lib/supabase/config";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  buildManualBriefingPersistencePayload,
  buildOrchestrationPersistencePayload,
  dashboardSnapshotToData,
  DEMO_AAC_VOLUNTEER_ID,
  DEMO_CAREGIVER_ID,
  DEMO_SENIOR_ID,
  emptyDemoDashboardSnapshot,
  type ManualBriefingPersistencePayload,
  type OrchestrationPersistencePayload,
  type PersistenceMeta,
} from "./orchestration";
import type { AgentRunContext, OrchestrateResponse } from "@/lib/agents/contracts";
import {
  evaluatePatternWatch,
  type PatternCandidate,
  type SeniorPatternContext,
  type PatternSignal,
} from "@/lib/patterns/patternWatch";
import {
  buildConsolidatedQueueEpisode,
  type QueuePatternInput,
} from "@/lib/patterns/queueConsolidation";

type TrustKakiClient = SupabaseClient;
type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

function localDemoMeta(reason?: string): PersistenceMeta {
  return {
    mode: "local_demo",
    configured: false,
    persisted: false,
    reason:
      reason ??
      "Supabase env vars are not configured. Running in non-persistent local demo mode.",
  };
}

function supabaseMeta(persisted = true): PersistenceMeta {
  return { mode: "supabase", configured: true, persisted };
}

function getClient(): TrustKakiClient | null {
  return createTrustKakiServiceClient() as TrustKakiClient | null;
}

function throwIfError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function isMissingRelationError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|schema cache/i.test(error.message ?? "")
  );
}

async function ensureDemoPeople(client: TrustKakiClient, context?: AgentRunContext) {
  const senior = context?.senior;
  const demoSeniorPhone = normalizePhoneNumber(process.env.TRUSTKAKI_DEMO_SENIOR_PHONE);

  const { error: seniorError } = await client.from("seniors").upsert(
    {
      id: DEMO_SENIOR_ID,
      external_ref: "demo_uncle_tan",
      display_name: senior?.name ?? uncleTan.name,
      age: senior?.age ?? uncleTan.age,
      living_situation: senior?.livingSituation ?? uncleTan.livingSituation,
      phone_e164: demoSeniorPhone,
    },
    { onConflict: "id" }
  );
  throwIfError(seniorError, "upsert demo senior");

  const { error: caregiversError } = await client.from("caregivers").upsert(
    [
      {
        id: DEMO_CAREGIVER_ID,
        external_ref: "demo_rachel_tan",
        display_name: senior?.caregiver ?? uncleTan.caregiver,
        relationship: "daughter",
      },
      {
        id: DEMO_AAC_VOLUNTEER_ID,
        external_ref: "demo_mei_ling",
        display_name: senior?.aacVolunteer ?? uncleTan.aacVolunteer,
        relationship: "AAC volunteer",
      },
    ],
    { onConflict: "id" }
  );
  throwIfError(caregiversError, "upsert demo caregivers");

  const { error: relationshipError } = await client
    .from("senior_caregivers")
    .upsert(
      [
        {
          senior_id: DEMO_SENIOR_ID,
          caregiver_id: DEMO_CAREGIVER_ID,
          role: "caregiver",
        },
        {
          senior_id: DEMO_SENIOR_ID,
          caregiver_id: DEMO_AAC_VOLUNTEER_ID,
          role: "aac_volunteer",
        },
      ],
      { onConflict: "senior_id,caregiver_id,role" }
    );
  throwIfError(relationshipError, "upsert demo relationships");
}

async function getOrCreateActiveCheckIn(
  client: TrustKakiClient,
  context: AgentRunContext
): Promise<TableRow<"check_ins">> {
  const { data: existing, error: selectError } = await client
    .from("check_ins")
    .select("*")
    .eq("senior_id", DEMO_SENIOR_ID)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  throwIfError(selectError, "select active check-in");

  if (existing) return existing;

  const { data, error } = await client
    .from("check_ins")
    .insert({
      senior_id: DEMO_SENIOR_ID,
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
  seniorId = DEMO_SENIOR_ID
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

async function upsertAgentRuns(
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

function observedAtFromContext(message: string, context: AgentRunContext): string {
  const matching = [...context.messages]
    .reverse()
    .find((msg) => msg.sender === "senior" && msg.text === message);
  return matching?.timestamp ?? new Date().toISOString();
}

async function readPatternSignals(
  client: TrustKakiClient,
  seniorId: string
): Promise<PatternSignal[]> {
  const { data: checkIns, error: checkInError } = await client
    .from("check_ins")
    .select("id")
    .eq("senior_id", seniorId);
  throwIfError(checkInError, "select senior check-ins for patterns");

  const checkInIds = (checkIns ?? []).map((row: { id: string }) => row.id);
  if (checkInIds.length === 0) return [];

  const { data, error } = await client
    .from("detected_signals")
    .select("id, signal_type, description, severity, observed_at")
    .in("check_in_id", checkInIds)
    .order("observed_at", { ascending: true });
  throwIfError(error, "select pattern signals");

  return (data ?? []).map(
    (row: {
      id: string;
      signal_type: PatternSignal["type"];
      description: string;
      severity: PatternSignal["severity"];
      observed_at: string;
    }) => ({
      id: row.id,
      type: row.signal_type,
      description: row.description,
      severity: row.severity,
      observedAt: row.observed_at,
    })
  );
}

async function readSeniorPatternContext(
  client: TrustKakiClient,
  seniorId: string
): Promise<SeniorPatternContext> {
  const [baselinesResult, healthResult, memoriesResult] = await Promise.all([
    client
      .from("routine_baselines")
      .select("id, baseline_type, label, usual_pattern")
      .eq("senior_id", seniorId)
      .eq("status", "active")
      .order("baseline_type", { ascending: true }),
    client
      .from("senior_health_contexts")
      .select("id, context_type, description, safe_use_notes")
      .eq("senior_id", seniorId)
      .eq("status", "active")
      .order("created_at", { ascending: true }),
    client
      .from("senior_memories")
      .select("id, memory_type, content")
      .eq("senior_id", seniorId)
      .eq("status", "active")
      .order("importance", { ascending: false }),
  ]);

  const missingRelation =
    isMissingRelationError(baselinesResult.error) ||
    isMissingRelationError(healthResult.error) ||
    isMissingRelationError(memoriesResult.error);
  if (missingRelation) {
    return { routineBaselines: [], healthContexts: [], memories: [] };
  }

  throwIfError(baselinesResult.error, "select routine baselines");
  throwIfError(healthResult.error, "select senior health contexts");
  throwIfError(memoriesResult.error, "select senior memories");

  return {
    routineBaselines: (baselinesResult.data ?? []).map((row) => ({
      id: row.id,
      baselineType: row.baseline_type,
      label: row.label,
      usualPattern: row.usual_pattern,
    })),
    healthContexts: (healthResult.data ?? []).map((row) => ({
      id: row.id,
      contextType: row.context_type,
      description: row.description,
      safeUseNotes: row.safe_use_notes,
    })),
    memories: (memoriesResult.data ?? []).map((row) => ({
      id: row.id,
      memoryType: row.memory_type,
      content: row.content,
    })),
  };
}

function patternRowToQueueInput(row: TableRow<"patterns">): QueuePatternInput {
  return {
    id: row.id,
    type: row.pattern_type,
    status: row.status,
    severity: row.severity,
    firstObservedAt: row.first_observed_at,
    latestObservedAt: row.latest_observed_at,
    conciseSummary: row.concise_summary,
    recommendedAction: row.recommended_action,
    comparison: row.comparison,
    usualRoutine: row.usual_routine,
  };
}

async function upsertPattern(
  client: TrustKakiClient,
  seniorId: string,
  candidate: PatternCandidate
): Promise<TableRow<"patterns">> {
  const { data: existing, error: existingError } = await client
    .from("patterns")
    .select("*")
    .eq("senior_id", seniorId)
    .eq("pattern_type", candidate.patternType)
    .in("status", ["emerging", "active"])
    .limit(1)
    .maybeSingle();
  throwIfError(existingError, "select active pattern");

  const patternPayload = {
    senior_id: seniorId,
    pattern_type: candidate.patternType,
    status: candidate.status,
    severity: candidate.severity,
    first_observed_at: existing?.first_observed_at ?? candidate.firstObservedAt,
    latest_observed_at: candidate.latestObservedAt,
    contributing_signal_ids: Array.from(
      new Set([
        ...((existing?.contributing_signal_ids as string[] | null) ?? []),
        ...candidate.contributingSignalIds,
      ])
    ),
    concise_summary: candidate.conciseSummary,
    recommended_action: candidate.recommendedAction,
    comparison: candidate.comparison,
    usual_routine: candidate.usualRoutine,
    known_context: candidate.knownContext,
    memory_notes: candidate.memoryNotes,
  };

  const { data: pattern, error: patternError } = existing
    ? await client
        .from("patterns")
        .update(patternPayload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await client.from("patterns").insert(patternPayload).select("*").single();
  throwIfError(patternError, "upsert pattern");
  return pattern;
}

async function upsertConsolidatedQueue(
  client: TrustKakiClient,
  seniorId: string,
  patterns: TableRow<"patterns">[]
) {
  const episode = buildConsolidatedQueueEpisode(
    seniorId,
    patterns.map(patternRowToQueueInput)
  );
  if (!episode) return;

  const { data: queue, error: queueSelectError } = await client
    .from("caregiver_queue_items")
    .select("id")
    .eq("senior_id", seniorId)
    .eq("episode_key", episode.episodeKey)
    .in("status", ["pending", "acknowledged", "followed_up", "snoozed"])
    .limit(1)
    .maybeSingle();
  throwIfError(queueSelectError, "select active consolidated queue item");

  const queuePayload = {
    senior_id: seniorId,
    pattern_id: episode.primaryPattern.id,
    episode_key: episode.episodeKey,
    related_pattern_ids: episode.relatedPatternIds,
    related_pattern_types: episode.relatedPatternTypes,
    reason: episode.reason,
    change_from_usual: episode.changeFromUsual,
    recommended_action: episode.recommendedAction,
    last_evidence_at: episode.lastEvidenceAt,
  };

  const { data: savedQueue, error: queueError } = queue
    ? await client
        .from("caregiver_queue_items")
        .update(queuePayload)
        .eq("id", queue.id)
        .select("id")
        .single()
    : await client.from("caregiver_queue_items").insert({
        ...queuePayload,
        status: "pending",
      }).select("id").single();
  throwIfError(queueError, "upsert caregiver queue item");

  const { data: activeRows, error: activeRowsError } = await client
    .from("caregiver_queue_items")
    .select("id")
    .eq("senior_id", seniorId)
    .in("status", ["pending", "acknowledged", "followed_up", "snoozed"]);
  throwIfError(activeRowsError, "select duplicate queue items");

  const keepId = savedQueue?.id;
  const duplicateIds = (activeRows ?? [])
    .map((row: { id: string }) => row.id)
    .filter((id: string) => id !== keepId);
  if (duplicateIds.length > 0) {
    const { error: duplicateError } = await client
      .from("caregiver_queue_items")
      .update({ status: "resolved" })
      .in("id", duplicateIds);
    throwIfError(duplicateError, "resolve duplicate queue items");
  }
}

async function runPatternWatchForSenior(client: TrustKakiClient, seniorId: string) {
  const signals = await readPatternSignals(client, seniorId);
  const context = await readSeniorPatternContext(client, seniorId);
  const candidates = evaluatePatternWatch(signals, context);
  for (const candidate of candidates) {
    await upsertPattern(client, seniorId, candidate);
  }

  const { data: openPatterns, error } = await client
    .from("patterns")
    .select("*")
    .eq("senior_id", seniorId)
    .in("status", ["emerging", "active"]);
  throwIfError(error, "select open patterns for consolidated queue");

  await upsertConsolidatedQueue(client, seniorId, openPatterns ?? []);
}

async function persistRiskEvent(
  client: TrustKakiClient,
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
      senior_id: DEMO_SENIOR_ID,
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
    .eq("id", DEMO_SENIOR_ID);
  throwIfError(seniorError, "update senior risk");
}

async function persistAlerts(
  client: TrustKakiClient,
  checkInId: string,
  payload: OrchestrationPersistencePayload
) {
  if (payload.alerts.length === 0) return;

  const { error } = await client.from("alerts").insert(
    payload.alerts.map((alert) => ({
      check_in_id: checkInId,
      senior_id: DEMO_SENIOR_ID,
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
  checkInId: string,
  brief: OrchestrationPersistencePayload["brief"] | ManualBriefingPersistencePayload["brief"],
  agentRuns: TableRow<"agent_runs">[]
) {
  if (!brief) return;

  const briefingRunId =
    agentRuns.find((run) => run.agent_id === "briefing")?.id ?? null;

  const { error } = await client.from("briefs").insert({
    check_in_id: checkInId,
    senior_id: DEMO_SENIOR_ID,
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
  message: string;
  context: AgentRunContext;
  result: OrchestrateResponse;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  await ensureDemoPeople(client, args.context);
  const checkIn = await getOrCreateActiveCheckIn(client, args.context);
  const payload = buildOrchestrationPersistencePayload(
    args.message,
    args.context,
    args.result
  );

  await upsertMessages(client, checkIn.id, [payload.inboundMessage]);
  await upsertMessages(client, checkIn.id, payload.outboundMessages);
  const agentRuns = await upsertAgentRuns(client, checkIn.id, payload.agentRuns);
  await persistSignals(
    client,
    checkIn.id,
    payload,
    agentRuns,
    observedAtFromContext(args.message, args.context)
  );
  await persistRiskEvent(client, checkIn.id, payload, agentRuns);
  await persistAlerts(client, checkIn.id, payload);
  await persistBrief(client, checkIn.id, payload.brief, agentRuns);
  await runPatternWatchForSenior(client, DEMO_SENIOR_ID);

  return supabaseMeta();
}

export async function persistQuickDemoTriageResult(args: {
  messageId: string;
  message: string;
  timestamp: string;
  context: AgentRunContext;
  result: AgentRunResult<TriageOutput>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  await ensureDemoPeople(client, args.context);
  const checkIn = await getOrCreateActiveCheckIn(client, args.context);

  const { error: messageError } = await client.from("messages").upsert(
    {
      check_in_id: checkIn.id,
      senior_id: DEMO_SENIOR_ID,
      sender: "senior",
      text: args.message,
      client_message_id: args.messageId,
      created_at: args.timestamp,
    },
    { onConflict: "client_message_id", ignoreDuplicates: true }
  );
  throwIfError(messageError, "upsert quick demo message");

  const agentRuns = await upsertAgentRuns(client, checkIn.id, [
    {
      agentId: args.result.agentId,
      agentName: args.result.agentName,
      traceId: args.result.traceId,
      input: args.result.input,
      reasoning: args.result.reasoning,
      output: args.result.output,
      outputJson: args.result.data,
      tags: args.result.tags,
      durationMs: args.result.durationMs,
      modelUsed: args.result.modelUsed,
      fallback: args.result.fallback,
      inputSummary: args.result.inputSummary,
      outputSummary: args.result.outputSummary,
      stateChanges: args.result.stateChanges,
      errorMessage: args.result.errorMessage ?? null,
    },
  ]);

  const triageRunId =
    agentRuns.find((run) => run.agent_id === "triage")?.id ?? null;
  if (args.result.data.signals.length > 0) {
    const { error } = await client.from("detected_signals").insert(
      args.result.data.signals.map((signal) => ({
        check_in_id: checkIn.id,
        signal_type: signal.type,
        description: signal.description,
        severity: signal.severity,
        source_agent_run_id: triageRunId,
        observed_at: args.timestamp,
      }))
    );
    throwIfError(error, "insert quick demo detected signals");
  }

  const { error: checkInError } = await client
    .from("check_ins")
    .update({
      risk_after: args.result.data.riskLevel,
      summary: args.result.data.summary,
    })
    .eq("id", checkIn.id);
  throwIfError(checkInError, "update quick demo check-in");

  const { error: seniorError } = await client
    .from("seniors")
    .update({
      risk_level: args.result.data.riskLevel,
      last_check_in_at: args.timestamp,
    })
    .eq("id", DEMO_SENIOR_ID);
  throwIfError(seniorError, "update quick demo senior");

  await runPatternWatchForSenior(client, DEMO_SENIOR_ID);
  return supabaseMeta();
}

export async function persistQuickDemoTimelineResult(args: {
  messages: Array<{ id: string; text: string; timestamp: string }>;
  context: AgentRunContext;
  result: AgentRunResult<TriageTimelineOutput>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  await ensureDemoPeople(client, args.context);
  const checkIn = await getOrCreateActiveCheckIn(client, args.context);

  const { error: messagesError } = await client.from("messages").upsert(
    args.messages.map((message) => ({
      check_in_id: checkIn.id,
      senior_id: DEMO_SENIOR_ID,
      sender: "senior" as const,
      text: message.text,
      client_message_id: message.id,
      created_at: message.timestamp,
    })),
    { onConflict: "client_message_id", ignoreDuplicates: true }
  );
  throwIfError(messagesError, "upsert quick demo timeline messages");

  const agentRuns = await upsertAgentRuns(client, checkIn.id, [
    {
      agentId: args.result.agentId,
      agentName: args.result.agentName,
      traceId: args.result.traceId,
      input: args.result.input,
      reasoning: args.result.reasoning,
      output: args.result.output,
      outputJson: args.result.data,
      tags: args.result.tags,
      durationMs: args.result.durationMs,
      modelUsed: args.result.modelUsed,
      fallback: args.result.fallback,
      inputSummary: args.result.inputSummary,
      outputSummary: args.result.outputSummary,
      stateChanges: args.result.stateChanges,
      errorMessage: args.result.errorMessage ?? null,
    },
  ]);

  const messageById = new Map(args.messages.map((message) => [message.id, message]));
  const triageRunId =
    agentRuns.find((run) => run.agent_id === "triage")?.id ?? null;
  const detectedSignals = args.result.data.messages.flatMap((analysis) => {
    const sourceMessage = messageById.get(analysis.messageId);
    if (!sourceMessage) return [];
    return analysis.signals.map((signal) => ({
      check_in_id: checkIn.id,
      signal_type: signal.type,
      description: signal.description,
      severity: signal.severity,
      source_agent_run_id: triageRunId,
      observed_at: sourceMessage.timestamp,
    }));
  });

  if (detectedSignals.length > 0) {
    const { error } = await client.from("detected_signals").insert(detectedSignals);
    throwIfError(error, "insert quick demo timeline detected signals");
  }

  const latestMessage = args.messages[args.messages.length - 1];
  const { error: checkInError } = await client
    .from("check_ins")
    .update({
      risk_after: args.result.data.overallRiskLevel,
      summary: args.result.data.summary,
    })
    .eq("id", checkIn.id);
  throwIfError(checkInError, "update quick demo timeline check-in");

  const { error: seniorError } = await client
    .from("seniors")
    .update({
      risk_level: args.result.data.overallRiskLevel,
      last_check_in_at: latestMessage?.timestamp ?? new Date().toISOString(),
    })
    .eq("id", DEMO_SENIOR_ID);
  throwIfError(seniorError, "update quick demo timeline senior");

  await runPatternWatchForSenior(client, DEMO_SENIOR_ID);
  return supabaseMeta();
}

export async function findSeniorContextByPhone(
  phone: string
): Promise<{
  seniorId: string;
  context: AgentRunContext;
} | null> {
  const client = getClient();
  if (!client) return null;

  await ensureDemoPeople(client);

  const normalized = normalizePhoneNumber(phone);
  if (!normalized) return null;

  const { data: senior, error } = await client
    .from("seniors")
    .select("*")
    .eq("phone_e164", normalized)
    .maybeSingle();
  throwIfError(error, "select senior by phone");

  if (!senior) return null;

  const caregiver = await getCaregiverName(client, "caregiver");
  const aacVolunteer = await getCaregiverName(client, "aac_volunteer");

  return {
    seniorId: senior.id,
    context: {
      senior: {
        name: senior.display_name,
        age: senior.age ?? uncleTan.age,
        livingSituation: senior.living_situation ?? uncleTan.livingSituation,
        caregiver,
        aacVolunteer,
      },
      messages: [],
      currentRiskLevel: senior.risk_level,
    },
  };
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
  clientMessageId: string;
  externalMessageId: string;
  externalMetadata?: Record<string, unknown>;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const { error } = await client
    .from("messages")
    .update({
      external_platform: "whatsapp",
      external_message_id: args.externalMessageId,
      external_metadata: args.externalMetadata ?? {},
    })
    .eq("client_message_id", args.clientMessageId);
  throwIfError(error, "update outbound WhatsApp metadata");

  return supabaseMeta();
}

export async function persistManualBriefingResult(args: {
  context: AgentRunContext;
  result: AgentRunResult<BriefingOutput>;
  briefing: BriefingOutput;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  await ensureDemoPeople(client, args.context);
  const checkIn = await getOrCreateActiveCheckIn(client, args.context);
  const payload = buildManualBriefingPersistencePayload(
    args.context,
    args.result,
    args.briefing
  );
  const agentRuns = await upsertAgentRuns(client, checkIn.id, [payload.agentRun]);
  await persistBrief(client, checkIn.id, payload.brief, agentRuns);

  return supabaseMeta();
}

function traceFromAgentRun(row: TableRow<"agent_runs">): AgentTrace {
  return {
    id: row.trace_id,
    agentId: row.agent_id,
    agentName: row.agent_name,
    timestamp: row.created_at,
    input: row.input,
    reasoning: row.reasoning,
    output: row.output,
    tags: row.tags,
    durationMs: row.duration_ms ?? undefined,
    modelUsed: row.model_used ?? undefined,
    fallback: row.fallback,
    inputSummary: row.input_summary ?? undefined,
    outputSummary: row.output_summary ?? undefined,
    stateChanges: Array.isArray(row.state_changes)
      ? (row.state_changes as string[])
      : undefined,
    errorMessage: row.error_message ?? null,
  };
}

function messageFromRow(row: TableRow<"messages">): Message {
  return {
    id: row.client_message_id ?? row.id,
    sender: row.sender,
    text: row.text,
    timestamp: row.created_at,
    agentId: row.agent_id ?? undefined,
  };
}

function riskPriority(risk: DashboardData["senior"]["riskLevel"]): number {
  if (risk === "red") return 0;
  if (risk === "yellow") return 1;
  return 2;
}

function patternPriority(patternType: PatternType | null): number {
  if (patternType === "combined_wellbeing_decline") return 0;
  if (patternType === "social_withdrawal") return 1;
  if (patternType === "mobility_and_frailty") return 2;
  return 3;
}

function triggerExplanation(patternType: PatternType): string {
  if (patternType === "mobility_and_frailty") {
    return "Triggered because mobility discomfort and reduced movement appeared across separate observations.";
  }
  if (patternType === "social_withdrawal") {
    return "Triggered because withdrawal or reduced participation appeared with unusual missed or delayed response.";
  }
  return "Triggered because appetite disruption, mobility reduction, and withdrawal/non-response appeared within the rolling window.";
}

async function readSignalEvidence(
  client: TrustKakiClient,
  signalIds: string[]
): Promise<PatternEvidenceItem[]> {
  if (signalIds.length === 0) return [];

  const { data, error } = await client
    .from("detected_signals")
    .select("id, signal_type, description, severity, observed_at")
    .in("id", signalIds)
    .order("observed_at", { ascending: true });
  throwIfError(error, "select pattern evidence");

  return (data ?? []).map(
    (row: {
      id: string;
      signal_type: PatternEvidenceItem["type"];
      description: string;
      severity: PatternEvidenceItem["severity"];
      observed_at: string;
    }) => ({
      id: row.id,
      type: row.signal_type,
      severity: row.severity,
      description: row.description,
      observedAt: row.observed_at,
    })
  );
}

async function readCaregiverActions(
  client: TrustKakiClient,
  queueItemId: string
): Promise<CaregiverActionItem[]> {
  const { data, error } = await client
    .from("caregiver_actions")
    .select("id, action_type, outcome_type, note, created_at, caregivers(display_name)")
    .eq("queue_item_id", queueItemId)
    .order("created_at", { ascending: false });
  throwIfError(error, "select caregiver actions");

  const rows = (data ?? []) as Array<{
    id: string;
    action_type: CaregiverActionItem["actionType"];
    outcome_type: CaregiverActionItem["outcomeType"];
    note: string | null;
    created_at: string;
    caregivers?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
  }>;

  return rows.map(
    (row: {
      id: string;
      action_type: CaregiverActionItem["actionType"];
      outcome_type: CaregiverActionItem["outcomeType"];
      note: string | null;
      created_at: string;
      caregivers?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
    }) => ({
      id: row.id,
      actionType: row.action_type,
      outcomeType: row.outcome_type,
      note: row.note,
      caregiver: Array.isArray(row.caregivers)
        ? row.caregivers[0]?.display_name ?? null
        : row.caregivers?.display_name ?? null,
      createdAt: row.created_at,
    })
  );
}

async function readPatternsByIds(
  client: TrustKakiClient,
  patternIds: string[]
): Promise<TableRow<"patterns">[]> {
  if (patternIds.length === 0) return [];

  const { data, error } = await client
    .from("patterns")
    .select("*")
    .in("id", patternIds);
  throwIfError(error, "select related patterns");

  return data ?? [];
}

async function buildFollowUpQueue(
  client: TrustKakiClient,
  senior: {
    id: string;
    display_name: string;
    risk_level: DashboardData["senior"]["riskLevel"];
    last_check_in_at: string | null;
  }
): Promise<FollowUpQueueItem[]> {
  const { data, error } = await client
    .from("caregiver_queue_items")
    .select("*, patterns(*), caregivers(display_name)")
    .eq("senior_id", senior.id)
    .in("status", ["pending", "acknowledged", "followed_up", "snoozed"])
    .order("last_evidence_at", { ascending: false })
    .limit(20);
  throwIfError(error, "select caregiver queue");

  const rows = (data ?? []) as Array<{
    id: string;
    status: FollowUpQueueItem["status"];
    reason: string;
    change_from_usual: string;
    recommended_action: string;
    related_pattern_ids?: string[] | null;
    related_pattern_types?: PatternType[] | null;
    episode_key?: string | null;
    last_evidence_at: string;
    updated_at: string;
    caregivers?: { display_name?: string | null } | null;
    patterns?: {
      id: string;
      pattern_type: PatternType;
      status: PatternDetail["status"];
      severity: PatternDetail["severity"];
      first_observed_at: string;
      latest_observed_at: string;
      contributing_signal_ids: string[];
      concise_summary: string;
      recommended_action: string;
      comparison: string | null;
      usual_routine: string[];
      known_context: string[];
      memory_notes: string[];
    } | null;
  }>;

  const items = await Promise.all(
    rows.map(async (row) => {
      const relatedPatternIds = Array.from(
        new Set([
          ...(row.related_pattern_ids ?? []),
          ...(row.patterns?.id ? [row.patterns.id] : []),
        ])
      );
      const relatedPatternRows = await readPatternsByIds(client, relatedPatternIds);
      const primaryPattern = row.patterns ?? relatedPatternRows[0] ?? null;
      const evidenceIds = Array.from(
        new Set(
          relatedPatternRows.flatMap(
            (patternRow) => patternRow.contributing_signal_ids ?? []
          )
        )
      );
      const evidence = evidenceIds.length > 0
        ? await readSignalEvidence(client, evidenceIds)
        : [];
      const actions = await readCaregiverActions(client, row.id);
      const relatedPatterns = relatedPatternRows.map((patternRow) => ({
        id: patternRow.id,
        type: patternRow.pattern_type,
        status: patternRow.status,
        severity: patternRow.severity,
      }));
      const pattern = primaryPattern
        ? {
            id: primaryPattern.id,
            type: primaryPattern.pattern_type,
            status: primaryPattern.status,
            severity: primaryPattern.severity,
            conciseSummary: primaryPattern.concise_summary,
            recommendedAction: primaryPattern.recommended_action,
            firstObservedAt: primaryPattern.first_observed_at,
            latestObservedAt: primaryPattern.latest_observed_at,
            evidence,
            triggerExplanation: triggerExplanation(primaryPattern.pattern_type),
            comparison: primaryPattern.comparison ?? row.change_from_usual,
            previousActions: actions,
            relatedPatterns,
            usualRoutine: primaryPattern.usual_routine,
            knownContext: primaryPattern.known_context,
            memoryNotes: primaryPattern.memory_notes,
          }
        : null;

      const priority =
        riskPriority(senior.risk_level) * 100 +
        patternPriority(primaryPattern?.pattern_type ?? null) * 10 +
        (row.status === "pending" ? 0 : 5);

      return {
        id: row.id,
        seniorName: senior.display_name,
        riskLevel: senior.risk_level,
        headline: `${senior.risk_level[0].toUpperCase()}${senior.risk_level.slice(1)} · Follow-up suggested`,
        reason: row.reason,
        changeFromUsual: row.change_from_usual,
        lastResponseAt: senior.last_check_in_at,
        recommendedAction: row.recommended_action,
        status: row.status,
        assignedTo: row.caregivers?.display_name ?? null,
        lastUpdatedAt: row.updated_at,
        priority,
        pattern,
        relatedPatterns,
      };
    })
  );

  return items.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    const oldestA = a.status === "pending" ? new Date(a.lastUpdatedAt).getTime() : Infinity;
    const oldestB = b.status === "pending" ? new Date(b.lastUpdatedAt).getTime() : Infinity;
    if (oldestA !== oldestB) return oldestA - oldestB;
    return new Date(b.lastUpdatedAt).getTime() - new Date(a.lastUpdatedAt).getTime();
  });
}

async function getCaregiverName(
  client: TrustKakiClient,
  role: "caregiver" | "aac_volunteer"
): Promise<string> {
  const { data, error } = await client
    .from("senior_caregivers")
    .select("caregiver_id, caregivers(display_name)")
    .eq("senior_id", DEMO_SENIOR_ID)
    .eq("role", role)
    .maybeSingle();
  throwIfError(error, `select ${role}`);

  const relation = data as
    | { caregivers?: { display_name?: string | null } | null }
    | null;
  return relation?.caregivers?.display_name ?? (role === "caregiver" ? uncleTan.caregiver : uncleTan.aacVolunteer);
}

export interface DashboardStateResult {
  persistence: PersistenceStatus & { persisted: boolean };
  data: DashboardData;
  briefing: BriefingOutput | null;
  traces: AgentTrace[];
}

export async function readDashboardState(options: {
  auth?: AuthenticatedCaregiver;
} = {}): Promise<DashboardStateResult> {
  if (
    options.auth &&
    !options.auth.accessibleSeniorIds.includes(DEMO_SENIOR_ID)
  ) {
    throw new Error("Forbidden");
  }

  const client = getClient();
  if (!client) {
    const mapped = dashboardSnapshotToData(emptyDemoDashboardSnapshot());
    return {
      persistence: { ...getPersistenceStatus(), persisted: false },
      ...mapped,
    };
  }

  await ensureDemoPeople(client);

  const { data: senior, error: seniorError } = await client
    .from("seniors")
    .select("*")
    .eq("id", DEMO_SENIOR_ID)
    .single();
  throwIfError(seniorError, "select senior");

  const { data: checkIn } = await client
    .from("check_ins")
    .select("*")
    .eq("senior_id", DEMO_SENIOR_ID)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const checkInId = checkIn?.id;

  const [{ data: messages }, { data: traces }, { data: alerts }, { data: brief }] =
    await Promise.all([
      checkInId
        ? client
            .from("messages")
            .select("*")
            .eq("check_in_id", checkInId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as TableRow<"messages">[] }),
      checkInId
        ? client
            .from("agent_runs")
            .select("*")
            .eq("check_in_id", checkInId)
            .order("created_at", { ascending: true })
        : Promise.resolve({ data: [] as TableRow<"agent_runs">[] }),
      client
        .from("alerts")
        .select("*")
        .eq("senior_id", DEMO_SENIOR_ID)
        .eq("acknowledged", false)
        .order("created_at", { ascending: false })
        .limit(20),
      client
        .from("briefs")
        .select("*")
        .eq("senior_id", DEMO_SENIOR_ID)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const caregiver = await getCaregiverName(client, "caregiver");
  const aacVolunteer = await getCaregiverName(client, "aac_volunteer");
  const followUpQueue = await buildFollowUpQueue(client, {
    id: senior.id,
    display_name: senior.display_name,
    risk_level: senior.risk_level,
    last_check_in_at: senior.last_check_in_at,
  });

  const mapped = dashboardSnapshotToData({
    senior: {
      name: senior.display_name,
      age: senior.age ?? uncleTan.age,
      livingSituation: senior.living_situation ?? uncleTan.livingSituation,
      caregiver,
      aacVolunteer,
      riskLevel: senior.risk_level,
      lastCheckIn: senior.last_check_in_at,
    },
    checkIn: checkIn
      ? {
          id: checkIn.id,
          startedAt: checkIn.started_at,
          status: checkIn.status,
          riskBefore: checkIn.risk_before,
          riskAfter: checkIn.risk_after,
          summary: checkIn.summary,
        }
      : null,
    messages: (messages ?? []).map(messageFromRow),
    traces: (traces ?? []).map(traceFromAgentRun),
    alerts: (alerts ?? []).map((alert) => ({
      id: alert.id,
      type: alert.signal_type,
      message: alert.message,
      timestamp: alert.created_at,
      acknowledged: alert.acknowledged,
    })),
    briefing: brief
      ? {
          forCaregiver: brief.for_caregiver,
          forAACVolunteer: brief.for_aac_volunteer,
          overallRisk: brief.overall_risk,
          keyConcerns: brief.key_concerns,
          recommendedActions: brief.recommended_actions,
        }
      : null,
  });

  return {
    persistence: { mode: "supabase", configured: true, persisted: true },
    data: {
      ...mapped.data,
      followUpQueue,
    },
    briefing: mapped.briefing,
    traces: mapped.traces,
  };
}

export async function resetDemoPersistence(): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const resetSteps = await Promise.all([
    client.from("caregiver_actions").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("caregiver_queue_items").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("patterns").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("scheduled_jobs").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("briefs").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("alerts").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("risk_events").delete().eq("senior_id", DEMO_SENIOR_ID),
    client.from("check_ins").delete().eq("senior_id", DEMO_SENIOR_ID),
  ]);
  resetSteps.forEach((result, index) => {
    throwIfError(result.error, `reset demo step ${index + 1}`);
  });

  await ensureDemoPeople(client);
  const { error } = await client
    .from("seniors")
    .update({ risk_level: "green", last_check_in_at: null })
    .eq("id", DEMO_SENIOR_ID);
  throwIfError(error, "reset demo senior");

  return supabaseMeta();
}

export async function recordCaregiverQueueAction(args: {
  auth?: AuthenticatedCaregiver;
  queueItemId: string;
  actionType: CaregiverActionItem["actionType"];
  outcomeType?: ContactOutcome | null;
  note?: string | null;
  assignedCaregiverId?: string | null;
  snoozedUntil?: string | null;
}): Promise<PersistenceMeta> {
  const client = getClient();
  if (!client) return localDemoMeta();

  const { data: queueItem, error: queueError } = await client
    .from("caregiver_queue_items")
    .select("id, senior_id, pattern_id, related_pattern_ids")
    .eq("id", args.queueItemId)
    .single();
  throwIfError(queueError, "select caregiver queue item");
  if (!queueItem) throw new Error("select caregiver queue item: not found");
  if (args.auth && !args.auth.accessibleSeniorIds.includes(queueItem.senior_id)) {
    throw new Error("Forbidden");
  }

  const caregiverId =
    args.assignedCaregiverId === "aac_volunteer"
      ? DEMO_AAC_VOLUNTEER_ID
      : args.assignedCaregiverId === "caregiver" || !args.assignedCaregiverId
        ? DEMO_CAREGIVER_ID
        : args.assignedCaregiverId;

  if (args.auth && args.actionType === "assign" && caregiverId !== args.auth.caregiverId) {
    const { data: assignmentRows, error: assignmentError } = await client
      .from("senior_caregivers")
      .select("caregiver_id")
      .eq("senior_id", queueItem.senior_id)
      .eq("caregiver_id", caregiverId);
    throwIfError(assignmentError, "select assignment caregiver");
    if (!assignmentRows || assignmentRows.length === 0) {
      throw new Error("Forbidden");
    }
  }

  const { error: actionError } = await client.from("caregiver_actions").insert({
    queue_item_id: queueItem.id,
    senior_id: queueItem.senior_id,
    caregiver_id: caregiverId,
    action_type: args.actionType,
    outcome_type: args.outcomeType ?? null,
    note: args.note ?? null,
  });
  throwIfError(actionError, "insert caregiver action");

  const queueUpdate: Record<string, unknown> = {};
  if (args.actionType === "mark_for_follow_up") queueUpdate.status = "acknowledged";
  if (args.actionType === "assign") {
    queueUpdate.status = "acknowledged";
    queueUpdate.assigned_caregiver_id = caregiverId;
  }
  if (args.actionType === "record_outcome") {
    queueUpdate.status =
      args.outcomeType === "resolved" || args.outcomeType === "reached_and_okay"
        ? "followed_up"
        : "acknowledged";
  }
  if (args.actionType === "snooze") {
    queueUpdate.status = "snoozed";
    queueUpdate.snoozed_until =
      args.snoozedUntil ?? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
  }
  if (args.actionType === "resolve") {
    queueUpdate.status = "resolved";
  }

  if (Object.keys(queueUpdate).length > 0) {
    const { error: updateError } = await client
      .from("caregiver_queue_items")
      .update(queueUpdate)
      .eq("id", queueItem.id);
    throwIfError(updateError, "update caregiver queue item");
  }

  const linkedPatternIds = Array.from(
    new Set([
      ...((queueItem.related_pattern_ids as string[] | null) ?? []),
      ...(queueItem.pattern_id ? [queueItem.pattern_id] : []),
    ])
  );

  if (args.actionType === "resolve" && linkedPatternIds.length > 0) {
    const { error: patternError } = await client
      .from("patterns")
      .update({ status: "resolved" })
      .in("id", linkedPatternIds);
    throwIfError(patternError, "resolve linked patterns");
  }

  return supabaseMeta();
}
