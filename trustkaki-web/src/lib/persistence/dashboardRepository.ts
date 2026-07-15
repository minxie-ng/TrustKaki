import "server-only";

import { uncleTan } from "@/data/demo";
import type { BriefingOutput } from "@/lib/agents/contracts";
import type { AuthenticatedCaregiver } from "@/lib/auth/session";
import { getPersistenceStatus, type PersistenceStatus } from "@/lib/supabase/config";
import type {
  AgentTrace,
  CaregiverActionItem,
  CaregiverOption,
  DashboardData,
  FollowUpQueueItem,
  Message,
  PatternDetail,
  PatternEvidenceItem,
  PatternType,
} from "@/lib/types";
import {
  dashboardSnapshotToData,
  DEMO_SENIOR_ID,
  emptyDemoDashboardSnapshot,
} from "./orchestration";
import { selectDashboardSeniorId } from "./dashboardSelection";
import {
  getClient,
  type TableRow,
  type TrustKakiClient,
  throwIfError,
} from "./persistenceSupport";

function addressFromSeniorRow(row: {
  address_text?: string | null;
}): string | null {
  return row.address_text ?? null;
}

function genderFromSeniorRow(row: {
  gender?: string | null;
  external_ref?: string | null;
  display_name?: string | null;
}): string | null {
  if (row.gender) return row.gender;
  if (row.external_ref === "demo_uncle_tan") return "Male";
  if (row.external_ref === "demo_aunty_lim") return "Female";
  if (row.external_ref === "demo_siti_fatimah") return "Female";
  return null;
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

export function resolveQueueRiskLevel(
  policyRisk: DashboardData["senior"]["riskLevel"],
  operationalRisk: DashboardData["senior"]["riskLevel"] | null
): DashboardData["senior"]["riskLevel"] {
  return operationalRisk ?? policyRisk;
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
    .select(
      "id, action_type, outcome_type, escalation_destination, note, created_at, actor_caregiver:caregivers!caregiver_actions_caregiver_id_fkey(display_name), assigned_caregiver:caregivers!caregiver_actions_assigned_caregiver_id_fkey(display_name)"
    )
    .eq("queue_item_id", queueItemId)
    .order("created_at", { ascending: false });
  throwIfError(error, "select caregiver actions");

  const rows = (data ?? []) as Array<{
    id: string;
    action_type: CaregiverActionItem["actionType"];
    outcome_type: CaregiverActionItem["outcomeType"];
    escalation_destination: CaregiverActionItem["escalationDestination"];
    note: string | null;
    created_at: string;
    actor_caregiver?:
      | { display_name?: string | null }
      | Array<{ display_name?: string | null }>
      | null;
    assigned_caregiver?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
  }>;

  return rows.map(
    (row: {
      id: string;
      action_type: CaregiverActionItem["actionType"];
      outcome_type: CaregiverActionItem["outcomeType"];
      escalation_destination: CaregiverActionItem["escalationDestination"];
      note: string | null;
      created_at: string;
      actor_caregiver?:
        | { display_name?: string | null }
        | Array<{ display_name?: string | null }>
        | null;
      assigned_caregiver?: { display_name?: string | null } | Array<{ display_name?: string | null }> | null;
    }) => ({
      id: row.id,
      actionType: row.action_type,
      outcomeType: row.outcome_type,
      escalationDestination: row.escalation_destination,
      assignedCaregiver: Array.isArray(row.assigned_caregiver)
        ? row.assigned_caregiver[0]?.display_name ?? null
        : row.assigned_caregiver?.display_name ?? null,
      note: row.note,
      caregiver: Array.isArray(row.actor_caregiver)
        ? row.actor_caregiver[0]?.display_name ?? null
        : row.actor_caregiver?.display_name ?? null,
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
    .in("status", ["pending", "acknowledged", "followed_up", "snoozed", "escalated"])
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
    operational_risk?: DashboardData["senior"]["riskLevel"] | null;
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
      const queueRisk = resolveQueueRiskLevel(
        senior.risk_level,
        row.operational_risk ?? null
      );
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
        riskPriority(queueRisk) * 100 +
        patternPriority(primaryPattern?.pattern_type ?? null) * 10 +
        (row.status === "pending" ? 0 : 5);

      return {
        id: row.id,
        seniorId: senior.id,
        seniorName: senior.display_name,
        riskLevel: queueRisk,
        headline: `${queueRisk[0].toUpperCase()}${queueRisk.slice(1)} · Follow-up suggested`,
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

async function listCaregiverNamesBySenior(
  client: TrustKakiClient,
  seniorIds: string[]
): Promise<
  Map<string, {
    caregiver: string | null;
    caregiverRelationship: string | null;
    caregiverIsPrimary: boolean;
    aacVolunteer: string | null;
    assignableCaregivers: CaregiverOption[];
  }>
> {
  if (seniorIds.length === 0) return new Map();

  const { data, error } = await client
    .from("senior_caregivers")
    .select("senior_id, caregiver_id, role, relationship, is_primary, caregivers(display_name)")
    .in("senior_id", seniorIds)
    .order("is_primary", { ascending: false });
  throwIfError(error, "select senior caregiver names");

  const result = new Map<
    string,
    {
      caregiver: string | null;
      caregiverRelationship: string | null;
      caregiverIsPrimary: boolean;
      aacVolunteer: string | null;
      assignableCaregivers: CaregiverOption[];
    }
  >();
  for (const seniorId of seniorIds) {
    result.set(seniorId, {
      caregiver: null,
      caregiverRelationship: null,
      caregiverIsPrimary: false,
      aacVolunteer: null,
      assignableCaregivers: [],
    });
  }

  const rows = (data ?? []) as Array<{
    senior_id: string;
    caregiver_id: string;
    role: "caregiver" | "aac_volunteer";
    relationship?: string | null;
    is_primary: boolean;
    caregivers?: { display_name?: string | null } | null;
  }>;
  for (const row of rows) {
    const current = result.get(row.senior_id) ?? {
      caregiver: null,
      caregiverRelationship: null,
      caregiverIsPrimary: false,
      aacVolunteer: null,
      assignableCaregivers: [],
    };
    const caregiverName = row.caregivers?.display_name ?? "Linked caregiver";
    if (!current.assignableCaregivers.some((option) => option.id === row.caregiver_id)) {
      current.assignableCaregivers.push({
        id: row.caregiver_id,
        name: caregiverName,
        relationship: row.relationship ?? null,
      });
    }
    if (
      row.role === "caregiver" &&
      (!current.caregiver || (row.is_primary && !current.caregiverIsPrimary))
    ) {
      current.caregiver = row.caregivers?.display_name ?? current.caregiver;
      current.caregiverRelationship =
        row.relationship ?? current.caregiverRelationship;
      current.caregiverIsPrimary = row.is_primary;
    }
    if (row.role === "aac_volunteer") {
      current.aacVolunteer =
        row.caregivers?.display_name ?? current.aacVolunteer;
    }
    result.set(row.senior_id, current);
  }
  return result;
}

export interface DashboardStateResult {
  persistence: PersistenceStatus & { persisted: boolean };
  data: DashboardData;
  briefing: BriefingOutput | null;
  traces: AgentTrace[];
}

export async function readDashboardState(options: {
  auth?: AuthenticatedCaregiver;
  seniorId?: string;
} = {}): Promise<DashboardStateResult> {
  const client = getClient();
  if (!client) {
    const mapped = dashboardSnapshotToData(emptyDemoDashboardSnapshot());
    return {
      persistence: { ...getPersistenceStatus(), persisted: false },
      ...mapped,
    };
  }

  const accessibleSeniorIds = options.auth?.accessibleSeniorIds.length
    ? options.auth.accessibleSeniorIds
    : [DEMO_SENIOR_ID];
  const selectedSeniorId = selectDashboardSeniorId({
    accessibleSeniorIds,
    requestedSeniorId: options.seniorId,
    preferredSeniorId: DEMO_SENIOR_ID,
  });

  const { data: seniorRows, error: seniorsError } = await client
    .from("seniors")
    .select("*")
    .in("id", accessibleSeniorIds)
    .order("risk_level", { ascending: false })
    .order("last_check_in_at", { ascending: false });
  throwIfError(seniorsError, "select accessible seniors");
  const seniors = seniorRows ?? [];
  if (seniors.length === 0) throw new Error("Forbidden");
  const orderedSeniors = [...seniors].sort((a, b) => {
    const riskDelta = riskPriority(a.risk_level) - riskPriority(b.risk_level);
    if (riskDelta !== 0) return riskDelta;
    return (
      new Date(b.last_check_in_at ?? 0).getTime() -
      new Date(a.last_check_in_at ?? 0).getTime()
    );
  });

  const senior = seniors.find((row) => row.id === selectedSeniorId);
  if (!senior) throw new Error("Forbidden");

  const { data: checkIn } = await client
    .from("check_ins")
    .select("*")
    .eq("senior_id", selectedSeniorId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const checkInId = checkIn?.id;

  const allFollowUpQueue = (
    await Promise.all(
      orderedSeniors.map((seniorRow) =>
        buildFollowUpQueue(client, {
          id: seniorRow.id,
          display_name: seniorRow.display_name,
          risk_level: seniorRow.risk_level,
          last_check_in_at: seniorRow.last_check_in_at,
        })
      )
    )
  )
    .flat()
    .sort((a, b) => a.priority - b.priority);

  const activeQueueCounts = new Map<string, number>();
  for (const item of allFollowUpQueue) {
    activeQueueCounts.set(
      item.seniorId,
      (activeQueueCounts.get(item.seniorId) ?? 0) + 1
    );
  }

  const caregiverNames = await listCaregiverNamesBySenior(
    client,
    orderedSeniors.map((seniorRow) => seniorRow.id)
  );

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
        .eq("senior_id", selectedSeniorId)
        .eq("acknowledged", false)
        .order("created_at", { ascending: false })
        .limit(20),
      client
        .from("briefs")
        .select("*")
        .eq("senior_id", selectedSeniorId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

  const selectedNames = caregiverNames.get(selectedSeniorId);
  const caregiver = selectedNames?.caregiver ?? uncleTan.caregiver;
  const caregiverRelationship =
    selectedNames?.caregiverRelationship ?? uncleTan.caregiverRelationship ?? null;
  const aacVolunteer = selectedNames?.aacVolunteer ?? uncleTan.aacVolunteer;

  const mapped = dashboardSnapshotToData({
    senior: {
      name: senior.display_name,
      age: senior.age ?? uncleTan.age,
      gender: genderFromSeniorRow(senior),
      address: addressFromSeniorRow(senior),
      livingSituation: senior.living_situation ?? uncleTan.livingSituation,
      caregiver,
      caregiverRelationship,
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
      selectedSeniorId,
      assignableCaregivers: selectedNames?.assignableCaregivers ?? [],
      seniors: orderedSeniors.map((seniorRow) => {
        const names = caregiverNames.get(seniorRow.id);
        return {
          id: seniorRow.id,
          name: seniorRow.display_name,
          age: seniorRow.age,
          gender: genderFromSeniorRow(seniorRow),
          address: addressFromSeniorRow(seniorRow),
          livingSituation: seniorRow.living_situation,
          riskLevel: seniorRow.risk_level,
          lastCheckIn: seniorRow.last_check_in_at,
          followUpCount: activeQueueCounts.get(seniorRow.id) ?? 0,
          primaryCaregiver: names?.caregiver ?? null,
          primaryCaregiverRelationship:
            names?.caregiverRelationship ?? null,
          aacVolunteer: names?.aacVolunteer ?? null,
        };
      }),
      followUpQueue: allFollowUpQueue,
    },
    briefing: mapped.briefing,
    traces: mapped.traces,
  };
}
