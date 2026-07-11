import type { PatternSeverity, PatternType } from "@/lib/types";
import type { SignalSeverity, SignalType } from "@/lib/supabase/types";

export interface PatternSignal {
  id: string;
  type: SignalType;
  severity: SignalSeverity;
  description: string;
  observedAt: string;
}

export interface PatternCandidate {
  patternType: PatternType;
  status: "active";
  severity: PatternSeverity;
  contributingSignalIds: string[];
  firstObservedAt: string;
  latestObservedAt: string;
  conciseSummary: string;
  recommendedAction: string;
}

const ROLLING_WINDOW_DAYS = 7;

const MOBILITY_TERMS = [
  "knee",
  "leg",
  "pain",
  "ache",
  "walking",
  "walk",
  "mobility",
  "stiff",
  "frail",
];

const MOVEMENT_REDUCTION_TERMS = [
  "downstairs",
  "stairs",
  "stay home",
  "staying home",
  "cannot go out",
  "avoid",
  "less activity",
  "reduced activity",
  "not going out",
  "movement",
];

const APPETITE_TERMS = [
  "not hungry",
  "appetite",
  "skip",
  "skipped",
  "meal",
  "breakfast",
  "lunch",
  "eat",
  "eating",
];

const WITHDRAWAL_TERMS = [
  "lonely",
  "alone",
  "withdraw",
  "paiseh",
  "don't want",
  "dont want",
  "not joining",
  "declined",
  "participation",
  "social",
];

const NON_RESPONSE_TERMS = [
  "missed",
  "no response",
  "non-response",
  "did not reply",
  "delayed",
  "late check-in",
  "check-in",
];

function includesAny(text: string, terms: string[]): boolean {
  const normalized = text.toLowerCase();
  return terms.some((term) => normalized.includes(term));
}

function daysBetween(a: string, b: string): number {
  return Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;
}

function uniqueDates(signals: PatternSignal[]): Set<string> {
  return new Set(signals.map((signal) => signal.observedAt.slice(0, 10)));
}

function sortByObservedAt(signals: PatternSignal[]): PatternSignal[] {
  return [...signals].sort(
    (a, b) => new Date(a.observedAt).getTime() - new Date(b.observedAt).getTime()
  );
}

function severityFrom(signals: PatternSignal[]): PatternSeverity {
  if (signals.some((signal) => signal.severity === "high")) return "high";
  return signals.length >= 3 ? "medium" : "low";
}

function buildCandidate(args: {
  patternType: PatternType;
  signals: PatternSignal[];
  summary: string;
  action: string;
}): PatternCandidate {
  const sorted = sortByObservedAt(args.signals);
  return {
    patternType: args.patternType,
    status: "active",
    severity: severityFrom(sorted),
    contributingSignalIds: sorted.map((signal) => signal.id),
    firstObservedAt: sorted[0].observedAt,
    latestObservedAt: sorted[sorted.length - 1].observedAt,
    conciseSummary: args.summary,
    recommendedAction: args.action,
  };
}

function combineUnique(...groups: PatternSignal[][]): PatternSignal[] {
  const byId = new Map<string, PatternSignal>();
  for (const signal of groups.flat()) byId.set(signal.id, signal);
  return [...byId.values()];
}

export function evaluatePatternWatch(signals: PatternSignal[]): PatternCandidate[] {
  if (signals.length < 2) return [];

  const recent = signals.filter((signal) => {
    const latest = Math.max(...signals.map((item) => new Date(item.observedAt).getTime()));
    return latest - new Date(signal.observedAt).getTime() <= ROLLING_WINDOW_DAYS * 86400000;
  });

  const mobilityPain = recent.filter(
    (signal) =>
      signal.type === "health" && includesAny(signal.description, MOBILITY_TERMS)
  );
  const movementReduction = recent.filter((signal) =>
    includesAny(signal.description, MOVEMENT_REDUCTION_TERMS)
  );
  const appetite = recent.filter(
    (signal) =>
      signal.type === "daily_living" && includesAny(signal.description, APPETITE_TERMS)
  );
  const withdrawal = recent.filter(
    (signal) =>
      signal.type === "social" && includesAny(signal.description, WITHDRAWAL_TERMS)
  );
  const nonResponse = recent.filter((signal) =>
    includesAny(signal.description, NON_RESPONSE_TERMS)
  );

  const candidates: PatternCandidate[] = [];
  const mobilityEvidence = combineUnique(mobilityPain, movementReduction);
  if (
    mobilityPain.length > 0 &&
    movementReduction.length > 0 &&
    mobilityEvidence.length >= 2 &&
    uniqueDates(mobilityEvidence).size >= 2
  ) {
    candidates.push(
      buildCandidate({
        patternType: "mobility_and_frailty",
        signals: mobilityEvidence,
        summary: "Mobility discomfort and reduced movement across multiple observations.",
        action: "Call today and consider a gentle one-to-one AAC lunch or lift-lobby check-in.",
      })
    );
  }

  const socialEvidence = combineUnique(withdrawal, nonResponse);
  if (
    withdrawal.length > 0 &&
    nonResponse.length > 0 &&
    socialEvidence.length >= 2 &&
    uniqueDates(socialEvidence).size >= 2
  ) {
    candidates.push(
      buildCandidate({
        patternType: "social_withdrawal",
        signals: socialEvidence,
        summary: "Reduced participation plus unusual missed or delayed check-in.",
        action: "Ask Mei Ling to try a low-pressure one-to-one contact today.",
      })
    );
  }

  const combinedEvidence = combineUnique(appetite, mobilityPain, movementReduction, withdrawal, nonResponse);
  const hasCombinedWindow =
    combinedEvidence.length >= 3 &&
    uniqueDates(combinedEvidence).size >= 3 &&
    daysBetween(
      sortByObservedAt(combinedEvidence)[0].observedAt,
      sortByObservedAt(combinedEvidence)[combinedEvidence.length - 1].observedAt
    ) <= ROLLING_WINDOW_DAYS;
  if (
    appetite.length > 0 &&
    (mobilityPain.length > 0 || movementReduction.length > 0) &&
    (withdrawal.length > 0 || nonResponse.length > 0) &&
    hasCombinedWindow
  ) {
    candidates.push(
      buildCandidate({
        patternType: "combined_wellbeing_decline",
        signals: combinedEvidence,
        summary: "Appetite disruption, mobility reduction, and withdrawal/non-response within a week.",
        action: "Call today; if unable to reach, refer to AAC staff for follow-up.",
      })
    );
  }

  return candidates;
}
