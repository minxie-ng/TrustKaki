import type { PatternSeverity, PatternType } from "@/lib/types";
import type { SignalSeverity, SignalType } from "@/lib/supabase/types";

export interface PatternSignal {
  id: string;
  type: SignalType;
  severity: SignalSeverity;
  description: string;
  observedAt: string;
}

export interface RoutineBaselineContext {
  id: string;
  baselineType: string;
  label: string;
  usualPattern: string;
}

export interface SeniorHealthContext {
  id: string;
  contextType: string;
  description: string;
  safeUseNotes?: string | null;
}

export interface SeniorMemoryContext {
  id: string;
  memoryType: string;
  content: string;
}

export interface SeniorPatternContext {
  routineBaselines: RoutineBaselineContext[];
  healthContexts: SeniorHealthContext[];
  memories: SeniorMemoryContext[];
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
  comparison: string;
  usualRoutine: string[];
  knownContext: string[];
  memoryNotes: string[];
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

function contextList(context?: SeniorPatternContext): {
  usualRoutine: string[];
  knownContext: string[];
  memoryNotes: string[];
} {
  return {
    usualRoutine: (context?.routineBaselines ?? [])
      .slice(0, 4)
      .map((baseline) => `${baseline.label}: ${baseline.usualPattern}`),
    knownContext: (context?.healthContexts ?? [])
      .slice(0, 3)
      .map((item) => item.description),
    memoryNotes: (context?.memories ?? [])
      .slice(0, 3)
      .map((memory) => memory.content),
  };
}

function comparisonFromContext(
  fallback: string,
  context?: SeniorPatternContext
): string {
  const routine = contextList(context).usualRoutine;
  if (routine.length === 0) return fallback;
  return `Different from known routine: ${routine.join(" ")}`;
}

function actionFromContext(
  fallback: string,
  context?: SeniorPatternContext
): string {
  const { knownContext, memoryNotes } = contextList(context);
  const prefersMeiLing = memoryNotes.some((note) =>
    note.toLowerCase().includes("mei ling")
  );
  const hasMobilityContext = knownContext.some((item) =>
    /knee|mobility|downstairs|walking|leg/i.test(item)
  );

  if (prefersMeiLing && hasMobilityContext) {
    return "Ask Mei Ling to make a low-pressure one-to-one check-in today and ask whether knee pain is affecting meals or downstairs trips.";
  }
  if (prefersMeiLing) {
    return "Ask Mei Ling to make a low-pressure one-to-one check-in today.";
  }
  if (hasMobilityContext) {
    return "Call today and ask whether knee pain is affecting meals, movement, or downstairs trips.";
  }
  return fallback;
}

function buildCandidate(args: {
  patternType: PatternType;
  signals: PatternSignal[];
  summary: string;
  action: string;
  comparison: string;
  context?: SeniorPatternContext;
}): PatternCandidate {
  const sorted = sortByObservedAt(args.signals);
  const context = contextList(args.context);
  return {
    patternType: args.patternType,
    status: "active",
    severity: severityFrom(sorted),
    contributingSignalIds: sorted.map((signal) => signal.id),
    firstObservedAt: sorted[0].observedAt,
    latestObservedAt: sorted[sorted.length - 1].observedAt,
    conciseSummary: args.summary,
    recommendedAction: actionFromContext(args.action, args.context),
    comparison: comparisonFromContext(args.comparison, args.context),
    usualRoutine: context.usualRoutine,
    knownContext: context.knownContext,
    memoryNotes: context.memoryNotes,
  };
}

function combineUnique(...groups: PatternSignal[][]): PatternSignal[] {
  const byId = new Map<string, PatternSignal>();
  for (const signal of groups.flat()) byId.set(signal.id, signal);
  return [...byId.values()];
}

export function evaluatePatternWatch(
  signals: PatternSignal[],
  context?: SeniorPatternContext
): PatternCandidate[] {
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
        comparison: "Different from his usual movement and downstairs routine.",
        context,
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
        comparison: "Different from his usual response and AAC participation pattern.",
        context,
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
        comparison:
          "Different from his usual appetite, movement, response, and AAC participation routine.",
        context,
      })
    );
  }

  return candidates;
}
