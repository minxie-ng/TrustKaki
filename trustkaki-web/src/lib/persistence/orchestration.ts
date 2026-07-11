import { uncleTan } from "@/data/demo";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
} from "@/lib/agents/contracts";
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
  senior: AgentRunContext["senior"];
  inboundMessage: PersistedMessageInput;
  outboundMessages: PersistedMessageInput[];
  agentRuns: PersistedAgentRunInput[];
  signals: PersistedSignalInput[];
  riskEvent: PersistedRiskEventInput;
  alerts: PersistedAlertInput[];
  brief: PersistedBriefInput | null;
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
    livingSituation: string;
    caregiver: string;
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

function findInboundClientMessageId(
  message: string,
  context: AgentRunContext
): string | null {
  const matching = [...context.messages]
    .reverse()
    .find((msg) => msg.sender === "senior" && msg.text === message);
  return matching?.id ?? null;
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
  message: string,
  context: AgentRunContext,
  result: OrchestrateResponse
): OrchestrationPersistencePayload {
  return {
    senior: context.senior,
    inboundMessage: {
      sender: "senior",
      text: message,
      agentId: null,
      clientMessageId: findInboundClientMessageId(message, context),
    },
    outboundMessages: result.messages.map((outbound, index) => ({
      sender: "trustkaki",
      text: outbound.text,
      agentId: outbound.agentId ?? null,
      clientMessageId: buildOutboundClientMessageId(result, index),
    })),
    agentRuns: result.traces.map(traceToPersistedAgentRun),
    signals: result.signals.map((signal) => ({
      type: signal.type,
      description: signal.description,
      severity: signal.severity,
    })),
    riskEvent: {
      previousRisk: context.currentRiskLevel,
      finalRisk: result.policy.finalRisk,
      riskChange: result.policy.riskChange,
      reasoning: result.policy.reasoning,
    },
    alerts: result.alerts.map((alert) => ({
      type: alert.type,
      message: alert.message,
      severity: alert.severity,
      urgent: alert.urgent ?? false,
      reason: alert.reason ?? null,
    })),
    brief: result.briefing
      ? {
          trigger: "policy",
          briefing: result.briefing,
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
