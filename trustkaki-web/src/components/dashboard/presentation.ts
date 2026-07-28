import type { FollowUpStatus, RiskLevel } from "@/lib/types";
import type { StatusTone } from "@/components/ui/StatusIndicator";

export const coverageRiskStyle: Record<
  RiskLevel,
  { edge: string; tint: string; tone: StatusTone }
> = {
  green: {
    edge: "border-l-emerald-400",
    tint: "bg-emerald-50",
    tone: "stable",
  },
  yellow: {
    edge: "border-l-amber-400",
    tint: "bg-amber-50",
    tone: "attention",
  },
  red: { edge: "border-l-red-500", tint: "bg-red-50", tone: "urgent" },
};

export const riskConfig: Record<
  RiskLevel,
  { bg: string; text: string; border: string; label: string; tone: StatusTone }
> = {
  green: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-l-emerald-400",
    label: "Low",
    tone: "stable",
  },
  yellow: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-l-yellow-400",
    label: "Medium",
    tone: "attention",
  },
  red: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-l-red-500",
    label: "High",
    tone: "urgent",
  },
};

export function riskHeadlineLabel(value: string, riskLevel: RiskLevel): string {
  return value.replace(/^(green|yellow|red)\b/i, riskConfig[riskLevel].label);
}

export function riskHeadlineText(value: string): string {
  return value.replace(/^(green|yellow|red)\s*·\s*/i, "");
}

export const statusLabel: Record<FollowUpStatus, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  followed_up: "Followed up",
  snoozed: "Snoozed",
  escalated: "Escalated",
  resolved: "Resolved",
};

export const statusTone: Record<FollowUpStatus, StatusTone> = {
  pending: "attention",
  acknowledged: "attention",
  followed_up: "stable",
  snoozed: "neutral",
  escalated: "urgent",
  resolved: "stable",
};

export const escalationDestinationLabel = {
  family_guardian: "Family or guardian",
  aac_supervisor: "AAC supervisor",
  healthcare_follow_up: "Healthcare follow-up",
  emergency_guidance: "Emergency guidance",
} as const;

export function formatDate(timestamp: string | null): string {
  if (!timestamp) return "No response yet";
  return new Date(timestamp).toLocaleString("en-SG", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function labelPattern(type: string): string {
  return type.replaceAll("_", " ");
}
