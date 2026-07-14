import type { FollowUpStatus, RiskLevel } from "@/lib/types";

export const riskConfig: Record<
  RiskLevel,
  { bg: string; text: string; border: string; label: string }
> = {
  green: {
    bg: "bg-emerald-100",
    text: "text-emerald-800",
    border: "border-l-emerald-400",
    label: "Green",
  },
  yellow: {
    bg: "bg-yellow-100",
    text: "text-yellow-800",
    border: "border-l-yellow-400",
    label: "Yellow",
  },
  red: {
    bg: "bg-red-100",
    text: "text-red-800",
    border: "border-l-red-500",
    label: "Red",
  },
};

export const statusLabel: Record<FollowUpStatus, string> = {
  pending: "Pending",
  acknowledged: "Acknowledged",
  followed_up: "Followed up",
  snoozed: "Snoozed",
  escalated: "Escalated",
  resolved: "Resolved",
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
