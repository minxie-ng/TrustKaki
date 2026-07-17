import "server-only";

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
import {
  isMissingRelationError,
  type TableRow,
  type TrustKakiClient,
  throwIfError,
} from "./persistenceSupport";

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
  const now = new Date().toISOString();
  const [baselinesResult, healthResult, memoriesResult] = await Promise.all([
    client
      .from("routine_baselines")
      .select("id, baseline_type, label, usual_pattern")
      .eq("senior_id", seniorId)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("baseline_type", { ascending: true }),
    client
      .from("senior_health_contexts")
      .select("id, context_type, description, safe_use_notes")
      .eq("senior_id", seniorId)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
      .order("created_at", { ascending: true }),
    client
      .from("senior_memories")
      .select("id, memory_type, content")
      .eq("senior_id", seniorId)
      .eq("status", "active")
      .or(`expires_at.is.null,expires_at.gt.${now}`)
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
    .in("status", ["pending", "acknowledged", "followed_up", "snoozed", "escalated"])
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
    .in("status", ["pending", "acknowledged", "followed_up", "snoozed", "escalated"]);
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

export async function runPatternWatchForSenior(
  client: TrustKakiClient,
  seniorId: string
) {
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
