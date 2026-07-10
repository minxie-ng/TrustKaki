// ─── TrustKaki Core Types ───

export type RiskLevel = "green" | "yellow" | "red";

export type AgentId =
  | "triage"
  | "daily_living"
  | "health_frailty"
  | "aac_nudge"
  | "digital_safety"
  | "briefing";

export interface AgentTrace {
  id: string;
  agentId: AgentId;
  agentName: string;
  timestamp: string;
  input: string;
  reasoning: string;
  output: string;
  tags: string[];
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
  livingSituation: string;
  caregiver: string;
  aacVolunteer: string;
  riskLevel: RiskLevel;
  lastCheckIn: string | null;
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
  senior: SeniorProfile;
  activeSessions: CheckInSession[];
  recentAlerts: AlertItem[];
}

export interface AlertItem {
  id: string;
  type: "health" | "daily_living" | "digital_safety" | "social";
  message: string;
  timestamp: string;
  acknowledged: boolean;
}


