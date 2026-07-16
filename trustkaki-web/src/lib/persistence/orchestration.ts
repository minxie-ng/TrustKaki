import { createHash } from "node:crypto";
import { uncleTan } from "@/data/demo";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
  OrchestrationResult,
} from "@/lib/agents/contracts";
import { memoryCandidateSchema } from "@/lib/agents/schemas";
import {
  type MemoryCandidate,
  type MemoryRejectionCategory,
  type MemoryTargetStore,
} from "@/lib/memory/contracts";
import {
  evaluateMemoryCandidate,
  expiryForRetention,
  normaliseContextKey,
} from "@/lib/memory/policy";
import type { Json } from "@/lib/supabase/types";
import type { AlertItem, AgentTrace, DashboardData, Message, RiskLevel } from "@/lib/types";
import type {
  BriefTrigger,
  CheckInStatus,
  MessageSender,
  SignalSeverity,
  SignalType,
} from "@/lib/supabase/types";

export const DEMO_SENIOR_ID = "00000000-0000-4000-8000-000000000001";
export const DEMO_CAREGIVER_ID = "00000000-0000-4000-8000-000000000002";
export const DEMO_AAC_VOLUNTEER_ID = "00000000-0000-4000-8000-000000000003";

export interface PersistenceMeta {
  mode: "supabase" | "local_demo";
  configured: boolean;
  persisted: boolean;
  reason?: string;
  replayed?: boolean;
  memory?: MemoryPersistenceSummary;
}

export interface MemoryPersistenceFailure {
  stage: "extraction" | "policy" | "rpc";
  category: "conflict" | "invalid_output" | "policy_error" | "provider_error" | "rpc_error";
}

export interface MemoryPersistenceSummary {
  attempted: number;
  accepted: number;
  rejected: number;
  duplicates: number;
  failed: number;
  failures: MemoryPersistenceFailure[];
}

export interface PersistedMessageInput {
  sender: MessageSender;
  text: string;
  agentId?: AgentTrace["agentId"] | null;
  clientMessageId?: string | null;
}

export interface PersistedAgentRunInput {
  agentId: AgentTrace["agentId"];
  agentName: string;
  traceId: string;
  input: string;
  reasoning: string;
  output: string;
  outputJson: unknown | null;
  tags: string[];
  durationMs?: number | null;
  modelUsed?: string | null;
  fallback: boolean;
  inputSummary?: string | null;
  outputSummary?: string | null;
  stateChanges?: string[];
  errorMessage?: string | null;
}

export interface PersistedSignalInput {
  type: SignalType;
  description: string;
  severity: SignalSeverity;
}

export interface PersistedRiskEventInput {
  previousRisk: RiskLevel;
  finalRisk: RiskLevel;
  riskChange: "none" | "increase" | "decrease";
  reasoning: string[];
}

export interface PersistedAlertInput {
  type: SignalType;
  message: string;
  severity: SignalSeverity;
  urgent: boolean;
  reason?: string | null;
}

export interface PersistedBriefInput {
  trigger: BriefTrigger;
  briefing: BriefingOutput;
}

export interface OrchestrationPersistencePayload {
  seniorId: string;
  senior: AgentRunContext["senior"];
  inboundMessage: PersistedMessageInput;
  outboundMessages: PersistedMessageInput[];
  agentRuns: PersistedAgentRunInput[];
  signals: PersistedSignalInput[];
  riskEvent: PersistedRiskEventInput;
  alerts: PersistedAlertInput[];
  brief: PersistedBriefInput | null;
}

type AutomaticContextIntent = "create" | "confirm" | "replace";

export interface AutomaticMemoryCommand {
  commandId: string;
  seniorId: string;
  sourceMessageId: string;
  accepted: boolean;
  payload: Json;
}

export class InvalidInternalOrchestrationResultError extends Error {
  constructor() {
    super("automatic memory requires a validated internal orchestration result");
    this.name = "InvalidInternalOrchestrationResultError";
  }
}

export class AmbiguousMemoryCandidatesError extends Error {
  constructor() {
    super("ambiguous context candidate key");
    this.name = "AmbiguousMemoryCandidatesError";
  }
}

function uuidFromDigest(value: string): string {
  const bytes = Buffer.from(createHash("sha256").update(value).digest().subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function automaticContextCommandId(args: {
  seniorId: string;
  sourceMessageId: string;
  targetStore: MemoryTargetStore;
  contextKey: string;
  intent: AutomaticContextIntent;
}): string {
  return uuidFromDigest(
    [
      "trustkaki:gate5:automatic-context:v2",
      args.seniorId,
      args.sourceMessageId,
      args.targetStore,
      normaliseContextKey(args.contextKey),
      args.intent,
    ].join(":")
  );
}

export function orchestrationArtifactId(args: {
  sourceMessageId: string;
  artifact: "signal" | "risk_event" | "alert" | "brief";
  index?: number;
}): string {
  return uuidFromDigest(
    [
      "trustkaki:orchestration-artifact:v1",
      args.sourceMessageId,
      args.artifact,
      String(args.index ?? 0),
    ].join(":")
  );
}

export function requireInternalOrchestrationResult(
  result: OrchestrateResponse
): OrchestrationResult {
  const candidates = (result as Partial<OrchestrationResult>).contextMemoryCandidates;
  if (!Array.isArray(candidates) || !memoryCandidateSchema.array().safeParse(candidates).success) {
    throw new InvalidInternalOrchestrationResultError();
  }
  return result as OrchestrationResult;
}

function acceptedPayload(
  candidate: MemoryCandidate,
  intent: AutomaticContextIntent,
  expiresAt: string
): Record<string, Json> {
  const common: Record<string, Json> = {
    store: candidate.targetStore,
    context_key: candidate.contextKey,
    decision: "accepted",
    intent,
    content: candidate.content,
    evidence_excerpt: candidate.evidenceExcerpt,
    confidence: candidate.confidence,
    expires_at: expiresAt,
    application_tags: candidate.applicationTags,
  };

  if (candidate.targetStore === "memory") {
    common.memory_type =
      candidate.contextType === "family_routing"
        ? "family_context"
        : candidate.contextType;
  } else if (candidate.targetStore === "health_context") {
    common.context_type =
      candidate.contextType === "accessibility_need" ? "sensory" : "other";
  } else {
    common.baseline_type = "other";
    common.label = candidate.contextKey.replace(/_/g, " ");
    common.schedule_json = {};
  }
  return common;
}

function rejectionPayload(args: {
  candidate: MemoryCandidate;
  intent: AutomaticContextIntent;
  reason: MemoryRejectionCategory;
}): Record<string, Json> {
  return {
    store: args.candidate.targetStore,
    context_key: normaliseContextKey(args.candidate.contextKey),
    decision: "rejected",
    intent: args.intent,
    rejection_reason: args.reason,
  };
}

export function buildAutomaticMemoryCommands(args: {
  seniorId: string;
  clientMessageId: string;
  persistedInboundId: string;
  persistedInboundCreatedAt: string;
  context: AgentRunContext;
  result: OrchestrationResult;
}): AutomaticMemoryCommand[] {
  const candidates = requireInternalOrchestrationResult(args.result)
    .contextMemoryCandidates;
  const candidateKeys = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.targetStore}:${normaliseContextKey(candidate.contextKey)}`;
    if (candidateKeys.has(key)) throw new AmbiguousMemoryCandidatesError();
    candidateKeys.add(key);
  }

  return candidates.map((candidate) => {
    const intent: AutomaticContextIntent = candidate.intent ?? "create";
    const source = args.context.messages.find(
      (message) => message.id === candidate.sourceMessageId && message.sender === "senior"
    );
    const eligibility = source
      ? evaluateMemoryCandidate(candidate, source)
      : { accepted: false as const, reason: "unsupported_evidence" as const };
    const currentMessageCited = candidate.sourceMessageId === args.clientMessageId;
    const accepted = eligibility.accepted && currentMessageCited;
    const payload = accepted
      ? acceptedPayload(
          eligibility.candidate,
          intent,
          expiryForRetention(
            eligibility.candidate.retentionClass,
            new Date(args.persistedInboundCreatedAt)
          )
        )
      : rejectionPayload({
          candidate,
          intent,
          reason: eligibility.accepted
            ? "unsupported_evidence"
            : eligibility.reason,
        });

    return {
      commandId: automaticContextCommandId({
        seniorId: args.seniorId,
        sourceMessageId: args.persistedInboundId,
        targetStore: candidate.targetStore,
        contextKey: candidate.contextKey,
        intent,
      }),
      seniorId: args.seniorId,
      sourceMessageId: args.persistedInboundId,
      accepted,
      payload,
    };
  });
}

export function buildOutboundClientMessageId(
  result: Pick<OrchestrateResponse, "traces">,
  index: number
): string {
  return `out_${result.traces[0]?.id ?? "no_trace"}_${index}`;
}

export interface ManualBriefingPersistencePayload {
  senior: AgentRunContext["senior"];
  agentRun: PersistedAgentRunInput;
  brief: PersistedBriefInput;
}

export interface DashboardPersistenceSnapshot {
  senior: {
    name: string;
    age: number;
    gender?: string | null;
    address?: string | null;
    livingSituation: string;
    caregiver: string;
    caregiverRelationship?: string | null;
    aacVolunteer: string;
    riskLevel: RiskLevel;
    lastCheckIn: string | null;
  };
  checkIn: {
    id: string;
    startedAt: string;
    status: CheckInStatus;
    riskBefore: RiskLevel;
    riskAfter: RiskLevel;
    summary: string | null;
  } | null;
  messages: Message[];
  traces: AgentTrace[];
  alerts: AlertItem[];
  briefing: BriefingOutput | null;
}

function safeParseOutputJson(output: string): unknown | null {
  try {
    return JSON.parse(output);
  } catch {
    return null;
  }
}

export function traceToPersistedAgentRun(trace: AgentTrace): PersistedAgentRunInput {
  return {
    agentId: trace.agentId,
    agentName: trace.agentName,
    traceId: trace.id,
    input: trace.input,
    reasoning: trace.reasoning,
    output: trace.output,
    outputJson: safeParseOutputJson(trace.output),
    tags: trace.tags,
    durationMs: trace.durationMs ?? null,
    modelUsed: trace.modelUsed ?? null,
    fallback: trace.fallback ?? false,
    inputSummary: trace.inputSummary ?? null,
    outputSummary: trace.outputSummary ?? null,
    stateChanges: trace.stateChanges ?? [],
    errorMessage: trace.errorMessage ?? null,
  };
}

export function buildOrchestrationPersistencePayload(
  args: {
    seniorId: string;
    message: string;
    clientMessageId: string;
    context: AgentRunContext;
    result: OrchestrateResponse;
  }
): OrchestrationPersistencePayload {
  return {
    seniorId: args.seniorId,
    senior: args.context.senior,
    inboundMessage: {
      sender: "senior",
      text: args.message,
      agentId: null,
      clientMessageId: args.clientMessageId,
    },
    outboundMessages: args.result.messages.map((outbound, index) => ({
      sender: "trustkaki",
      text: outbound.text,
      agentId: outbound.agentId ?? null,
      clientMessageId: buildOutboundClientMessageId(args.result, index),
    })),
    agentRuns: args.result.traces.map(traceToPersistedAgentRun),
    signals: args.result.signals.map((signal) => ({
      type: signal.type,
      description: signal.description,
      severity: signal.severity,
    })),
    riskEvent: {
      previousRisk: args.context.currentRiskLevel,
      finalRisk: args.result.policy.finalRisk,
      riskChange: args.result.policy.riskChange,
      reasoning: args.result.policy.reasoning,
    },
    alerts: args.result.alerts.map((alert) => ({
      type: alert.type,
      message: alert.message,
      severity: alert.severity,
      urgent: alert.urgent ?? false,
      reason: alert.reason ?? null,
    })),
    brief: args.result.briefing
      ? {
          trigger: "policy",
          briefing: args.result.briefing,
        }
      : null,
  };
}

export function buildManualBriefingPersistencePayload(
  context: AgentRunContext,
  result: AgentRunResult<BriefingOutput>,
  briefing: BriefingOutput
): ManualBriefingPersistencePayload {
  return {
    senior: context.senior,
    agentRun: {
      agentId: result.agentId,
      agentName: result.agentName,
      traceId: result.traceId,
      input: result.input,
      reasoning: result.reasoning,
      output: JSON.stringify(briefing, null, 2),
      outputJson: briefing,
      tags: [...result.tags, "manual_override"],
      durationMs: result.durationMs,
      modelUsed: result.modelUsed,
      fallback: result.fallback,
      inputSummary: result.inputSummary,
      outputSummary: result.outputSummary,
      stateChanges: result.stateChanges,
      errorMessage: result.errorMessage ?? null,
    },
    brief: {
      trigger: "manual_override",
      briefing,
    },
  };
}

export function dashboardSnapshotToData(
  snapshot: DashboardPersistenceSnapshot
): { data: DashboardData; briefing: BriefingOutput | null; traces: AgentTrace[] } {
  const session = snapshot.checkIn
    ? {
        id: snapshot.checkIn.id,
        startedAt: snapshot.checkIn.startedAt,
        status: snapshot.checkIn.status,
        messages: snapshot.messages,
        traces: snapshot.traces,
        riskBefore: snapshot.checkIn.riskBefore,
        riskAfter: snapshot.checkIn.riskAfter,
        summary: snapshot.checkIn.summary,
      }
    : {
        id: "session-local-demo",
        startedAt: new Date().toISOString(),
        status: "pending" as const,
        messages: snapshot.messages,
        traces: snapshot.traces,
        riskBefore: "green" as const,
        riskAfter: snapshot.senior.riskLevel,
        summary: null,
      };

  return {
    data: {
      senior: snapshot.senior,
      activeSessions: [session],
      recentAlerts: snapshot.alerts,
      followUpQueue: [],
    },
    briefing: snapshot.briefing,
    traces: snapshot.traces,
  };
}

export function emptyDemoDashboardSnapshot(): DashboardPersistenceSnapshot {
  return {
    senior: {
      ...uncleTan,
      riskLevel: "green",
      lastCheckIn: null,
    },
    checkIn: null,
    messages: [],
    traces: [],
    alerts: [],
    briefing: null,
  };
}
