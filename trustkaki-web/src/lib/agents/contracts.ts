// ─── TrustKaki Agent Contracts ───
// Typed input/output contracts for each agent in the multi-agent system.

import type { AgentId, RiskLevel, Message, AgentTrace } from "@/lib/types";
import type {
  MemoryCandidate,
  MemorySourceMessage,
  MemoryTargetStore,
} from "@/lib/memory/contracts";
import type { PolicyResult } from "./policy";

// ─── Shared Context ───
export interface AgentRunContext {
  senior: {
    name: string;
    age: number;
    livingSituation: string;
    caregiver: string;
    aacVolunteer: string;
  };
  messages: Message[];
  currentRiskLevel: RiskLevel;
}

// ─── Agent Run Result ───
export interface AgentRunResult<T> {
  agentId: AgentId;
  agentName: string;
  traceId: string;
  timestamp: string;
  input: string;
  reasoning: string;
  output: string;
  tags: string[];
  data: T;
  durationMs: number;
  modelUsed: string;
  fallback: boolean;
  inputSummary: string;
  outputSummary: string;
  stateChanges: string[];
  errorMessage?: string | null;
}

// ─── Orchestrator Agent ───
export interface OrchestratorInput {
  message: string;
  context: AgentRunContext;
}

export type SpecialistAgentId =
  | "triage"
  | "aac_nudge"
  | "digital_safety"
  | "context_memory";

export interface OrchestratorOutput {
  agentsToRun: SpecialistAgentId[];
  priority: Partial<Record<SpecialistAgentId, "high" | "medium" | "low">>;
  reasoning: string;
}

// ─── Context Memory Agent ───
export interface ContextMemoryActiveContext {
  targetStore: MemoryTargetStore;
  contextKey: string;
  summary: string;
}

export interface ContextMemoryInput {
  message: MemorySourceMessage;
  recentMessages: MemorySourceMessage[];
  activeContext: ContextMemoryActiveContext[];
}

export interface ContextMemoryOutput {
  candidates: MemoryCandidate[];
}

// ─── Triage Agent ───
export interface TriageInput {
  message: string;
  context: AgentRunContext;
}

export interface TriageSignal {
  type: "health" | "daily_living" | "digital_safety" | "social";
  category?:
    | "daily_living"
    | "health_frailty_signal"
    | "social_isolation"
    | "digital_safety"
    | "caregiver_aac_escalation"
    | "emergency_high_risk";
  description: string;
  severity: "low" | "medium" | "high";
}

export interface TriageOutput {
  signals: TriageSignal[];
  riskLevel: RiskLevel;
  riskChange: "none" | "increase" | "decrease";
  confidence?: number;
  routing: string[];
  summary: string;
  responseMessage: string;
  humanFollowUpRequired: boolean;
  recommendedAction?: string;
}

export interface TriageTimelineMessageAnalysis {
  messageId: string;
  signals: TriageSignal[];
  riskLevel: RiskLevel;
  summary: string;
  humanFollowUpRequired: boolean;
  recommendedAction?: string;
}

export interface TriageTimelineOutput {
  messages: TriageTimelineMessageAnalysis[];
  overallRiskLevel: RiskLevel;
  summary: string;
}

// ─── AAC Nudge Agent ───
export interface AACNudgeInput {
  message: string;
  context: AgentRunContext;
  triageSignals: TriageSignal[];
}

export interface AACNudgeOutput {
  nudgeMessage: string;
  approach: string;
  rationale: string;
  suggestedChannel: "whatsapp" | "call" | "in_person";
}

// ─── Digital Safety Agent ───
export interface DigitalSafetyInput {
  message: string;
  context: AgentRunContext;
}

export interface DigitalSafetyOutput {
  isScam: boolean;
  scamType: string | null;
  confidence: number;
  warningMessage: string;
  educationalNote: string;
}

// ─── Briefing Agent ───
export interface BriefingInput {
  context: AgentRunContext;
  triageResult?: TriageOutput;
  aacNudgeResult?: AACNudgeOutput;
  digitalSafetyResult?: DigitalSafetyOutput;
}

export interface BriefingOutput {
  forCaregiver: string;
  forAACVolunteer: string;
  overallRisk: RiskLevel;
  keyConcerns: string[];
  recommendedActions: string[];
}

// ─── Orchestration Response ───
export interface OrchestrateResponse {
  messages: Array<{ text: string; agentId?: AgentId }>;
  traces: AgentTrace[];
  alerts: Array<{
    type: "health" | "daily_living" | "digital_safety" | "social";
    message: string;
    severity: "low" | "medium" | "high";
    urgent?: boolean;
    reason?: string;
  }>;
  riskLevel: RiskLevel;
  riskChange: "none" | "increase" | "decrease";
  signals: TriageSignal[];
  policy: PolicyResult;
  briefing: BriefingOutput | null;
  persistence?: {
    mode: "supabase" | "local_demo";
    configured: boolean;
    persisted: boolean;
    reason?: string;
  };
}

export interface OrchestrationResult extends OrchestrateResponse {
  contextMemoryCandidates: MemoryCandidate[];
}
