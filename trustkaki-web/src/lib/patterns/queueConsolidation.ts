import type { PatternSeverity, PatternStatus, PatternType } from "@/lib/types";

export interface QueuePatternInput {
  id: string;
  type: PatternType;
  status: PatternStatus;
  severity: PatternSeverity;
  firstObservedAt: string;
  latestObservedAt: string;
  conciseSummary: string;
  recommendedAction: string;
}

export interface ConsolidatedQueueEpisode {
  episodeKey: string;
  primaryPattern: QueuePatternInput;
  relatedPatternIds: string[];
  relatedPatternTypes: PatternType[];
  reason: string;
  changeFromUsual: string;
  recommendedAction: string;
  lastEvidenceAt: string;
}

const PRIMARY_PATTERN_PRIORITY: Record<PatternType, number> = {
  combined_wellbeing_decline: 0,
  social_withdrawal: 1,
  mobility_and_frailty: 2,
};

const ACTIVE_PATTERN_STATUSES = new Set<PatternStatus>(["emerging", "active"]);

function patternPriority(pattern: QueuePatternInput): number {
  return PRIMARY_PATTERN_PRIORITY[pattern.type] ?? 99;
}

function sortedUniquePatternTypes(patterns: QueuePatternInput[]): PatternType[] {
  return Array.from(new Set(patterns.map((pattern) => pattern.type))).sort(
    (a, b) => PRIMARY_PATTERN_PRIORITY[a] - PRIMARY_PATTERN_PRIORITY[b]
  );
}

function daysCovered(patterns: QueuePatternInput[]): number {
  const first = Math.min(
    ...patterns.map((pattern) => new Date(pattern.firstObservedAt).getTime())
  );
  const latest = Math.max(
    ...patterns.map((pattern) => new Date(pattern.latestObservedAt).getTime())
  );
  return Math.max(1, Math.round((latest - first) / 86400000) + 1);
}

export function supportingPatternLabel(types: PatternType[]): string {
  const labels: Record<PatternType, string> = {
    mobility_and_frailty: "mobility/frailty",
    social_withdrawal: "social withdrawal",
    combined_wellbeing_decline: "combined wellbeing decline",
  };
  return types.map((type) => labels[type]).join(" and ");
}

export function buildConsolidatedQueueEpisode(
  seniorId: string,
  patterns: QueuePatternInput[]
): ConsolidatedQueueEpisode | null {
  const activePatterns = patterns.filter((pattern) =>
    ACTIVE_PATTERN_STATUSES.has(pattern.status)
  );
  if (activePatterns.length === 0) return null;

  const ordered = [...activePatterns].sort((a, b) => {
    const priorityDelta = patternPriority(a) - patternPriority(b);
    if (priorityDelta !== 0) return priorityDelta;
    return (
      new Date(b.latestObservedAt).getTime() -
      new Date(a.latestObservedAt).getTime()
    );
  });
  const primaryPattern = ordered[0];
  const relatedPatternTypes = sortedUniquePatternTypes(activePatterns);
  const coveredDays = daysCovered(activePatterns);
  const lastEvidenceAt = new Date(
    Math.max(
      ...activePatterns.map((pattern) =>
        new Date(pattern.latestObservedAt).getTime()
      )
    )
  ).toISOString();

  if (relatedPatternTypes.includes("combined_wellbeing_decline")) {
    return {
      episodeKey: `${seniorId}:active_pattern_episode`,
      primaryPattern,
      relatedPatternIds: activePatterns.map((pattern) => pattern.id),
      relatedPatternTypes,
      reason: `Mobility, appetite and routine changes across ${coveredDays} days.`,
      changeFromUsual:
        "Different from his usual appetite, movement, response, and AAC participation routine.",
      recommendedAction:
        "Call today and check whether he needs mobility or meal support.",
      lastEvidenceAt,
    };
  }

  if (
    relatedPatternTypes.includes("mobility_and_frailty") &&
    relatedPatternTypes.includes("social_withdrawal")
  ) {
    return {
      episodeKey: `${seniorId}:active_pattern_episode`,
      primaryPattern,
      relatedPatternIds: activePatterns.map((pattern) => pattern.id),
      relatedPatternTypes,
      reason: `Mobility changes and social hesitation across ${coveredDays} days.`,
      changeFromUsual:
        "Different from his usual movement and AAC participation pattern.",
      recommendedAction:
        "Ask Mei Ling to make a low-pressure check-in and offer practical help.",
      lastEvidenceAt,
    };
  }

  return {
    episodeKey: `${seniorId}:active_pattern_episode`,
    primaryPattern,
    relatedPatternIds: activePatterns.map((pattern) => pattern.id),
    relatedPatternTypes,
    reason: primaryPattern.conciseSummary,
    changeFromUsual:
      primaryPattern.type === "mobility_and_frailty"
        ? "Different from his usual movement and downstairs routine."
        : "Different from his usual response and AAC participation pattern.",
    recommendedAction: primaryPattern.recommendedAction,
    lastEvidenceAt,
  };
}
