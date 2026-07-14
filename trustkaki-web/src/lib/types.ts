import type {
  ConsentEventType,
  ContactChannel,
  ContactKind,
  ContactVerificationStatus,
  NotificationCategory,
} from "@/lib/contacts/contracts";

// ─── TrustKaki Core Types ───

export type RiskLevel = "green" | "yellow" | "red";

export type AgentId =
  | "orchestrator"
  | "triage"
  | "policy"
  | "daily_living"
  | "health_frailty"
  | "aac_nudge"
  | "digital_safety"
  | "briefing"
  | "pattern_watch";

export interface AgentTrace {
  id: string;
  agentId: AgentId;
  agentName: string;
  timestamp: string;
  input: string;
  reasoning: string;
  output: string;
  tags: string[];
  durationMs?: number;
  modelUsed?: string;
  fallback?: boolean;
  inputSummary?: string;
  outputSummary?: string;
  stateChanges?: string[];
  errorMessage?: string | null;
}

export interface Message {
  id: string;
  sender: "senior" | "trustkaki" | "system";
  text: string;
  timestamp: string;
  agentId?: AgentId;
}

export interface SeniorProfile {
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
}

export interface SeniorListItem {
  id: string;
  name: string;
  age?: number | null;
  gender?: string | null;
  address?: string | null;
  livingSituation?: string | null;
  riskLevel: RiskLevel;
  lastCheckIn: string | null;
  followUpCount: number;
  primaryCaregiver: string | null;
  primaryCaregiverRelationship?: string | null;
  aacVolunteer: string | null;
}

export interface CheckInSession {
  id: string;
  startedAt: string;
  status: "pending" | "active" | "completed";
  messages: Message[];
  traces: AgentTrace[];
  riskBefore: RiskLevel;
  riskAfter: RiskLevel;
  summary: string | null;
}

export interface DashboardData {
  selectedSeniorId?: string;
  seniors?: SeniorListItem[];
  assignableCaregivers?: CaregiverOption[];
  senior: SeniorProfile;
  activeSessions: CheckInSession[];
  recentAlerts: AlertItem[];
  followUpQueue: FollowUpQueueItem[];
}

export interface MaskedContactConsent {
  eventType: ConsentEventType;
  categories: NotificationCategory[];
  allowUrgentQuietHours: boolean;
  confirmationMethod: string;
  confirmedAt: string;
  expiresAt: string | null;
}

export interface MaskedContactMethod {
  id: string;
  channel: ContactChannel;
  maskedDestination: string;
  verificationStatus: ContactVerificationStatus;
  verifiedAt: string | null;
  methodPriority: number;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
  timezone: string;
  active: boolean;
  updatedAt: string;
  consent: MaskedContactConsent | null;
}

export interface MaskedSeniorContact {
  id: string;
  displayName: string;
  relationship: string;
  contactKind: ContactKind;
  preferredLanguage: string;
  timezone: string;
  escalationPriority: number;
  active: boolean;
  updatedAt: string;
  methods: MaskedContactMethod[];
}

export interface MaskedContactPlan {
  seniorId: string;
  contacts: MaskedSeniorContact[];
}

export interface CaregiverOption {
  id: string;
  name: string;
  relationship: string | null;
}

export interface AlertItem {
  id: string;
  type: "health" | "daily_living" | "digital_safety" | "social";
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

export type PatternType =
  | "mobility_and_frailty"
  | "social_withdrawal"
  | "combined_wellbeing_decline";

export type PatternStatus = "emerging" | "active" | "resolved";
export type PatternSeverity = "low" | "medium" | "high";
export type FollowUpStatus =
  | "pending"
  | "acknowledged"
  | "followed_up"
  | "snoozed"
  | "escalated"
  | "resolved";
export type EscalationDestination =
  | "family_guardian"
  | "aac_supervisor"
  | "healthcare_follow_up"
  | "emergency_guidance";
export type ContactOutcome =
  | "reached_and_okay"
  | "needs_follow_up"
  | "referred_to_aac_staff"
  | "unable_to_reach"
  | "resolved";

export interface PatternEvidenceItem {
  id: string;
  type: AlertItem["type"];
  severity: PatternSeverity;
  description: string;
  observedAt: string;
  message?: string;
}

export interface CaregiverActionItem {
  id: string;
  actionType: "mark_for_follow_up" | "assign" | "record_outcome" | "snooze" | "escalate" | "resolve";
  outcomeType?: ContactOutcome | null;
  escalationDestination?: EscalationDestination | null;
  assignedCaregiver?: string | null;
  note?: string | null;
  caregiver?: string | null;
  createdAt: string;
}

export interface PatternDetail {
  id: string;
  type: PatternType;
  status: PatternStatus;
  severity: PatternSeverity;
  conciseSummary: string;
  recommendedAction: string;
  firstObservedAt: string;
  latestObservedAt: string;
  evidence: PatternEvidenceItem[];
  triggerExplanation: string;
  comparison: string;
  previousActions: CaregiverActionItem[];
  relatedPatterns?: RelatedPatternSummary[];
  usualRoutine?: string[];
  knownContext?: string[];
  memoryNotes?: string[];
}

export interface RelatedPatternSummary {
  id: string;
  type: PatternType;
  status: PatternStatus;
  severity: PatternSeverity;
}

export interface FollowUpQueueItem {
  id: string;
  seniorId: string;
  seniorName: string;
  riskLevel: RiskLevel;
  headline: string;
  reason: string;
  changeFromUsual: string;
  lastResponseAt: string | null;
  recommendedAction: string;
  status: FollowUpStatus;
  assignedTo: string | null;
  lastUpdatedAt: string;
  priority: number;
  pattern?: PatternDetail | null;
  relatedPatterns: RelatedPatternSummary[];
}
