import type {
  BenchmarkCase,
  BenchmarkObservation,
  BenchmarkSpecialist,
} from "./contracts";

export interface BenchmarkMetrics {
  caseCount: number;
  routeExactMatchRate: number | null;
  requiredSpecialistRecall: number | null;
  forbiddenSpecialistAvoidance: number | null;
  digitalSafetyRecall: number | null;
  durableContextPrecision: number | null;
  schemaValidRate: number;
  fallbackRate: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  failedCaseIds: string[];
}

function divide(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

function sameSet(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value) => right.includes(value));
}

function median(sortedValues: readonly number[]): number {
  const midpoint = Math.floor(sortedValues.length / 2);
  if (sortedValues.length % 2 === 1) return sortedValues[midpoint];
  return (sortedValues[midpoint - 1] + sortedValues[midpoint]) / 2;
}

function nearestRankP95(sortedValues: readonly number[]): number {
  return sortedValues[Math.max(0, Math.ceil(sortedValues.length * 0.95) - 1)];
}

function selected(
  observation: BenchmarkObservation,
  specialist: BenchmarkSpecialist
): boolean {
  return observation.selectedAgents.includes(specialist);
}

export function scoreBenchmark(
  cases: readonly BenchmarkCase[],
  observations: readonly BenchmarkObservation[]
): BenchmarkMetrics {
  if (cases.length === 0) throw new Error("Benchmark requires at least one case");

  const caseIds = new Set(cases.map((item) => item.id));
  const observationsById = new Map<string, BenchmarkObservation>();
  for (const observation of observations) {
    if (!caseIds.has(observation.caseId)) {
      throw new Error(`Unknown observation case id: ${observation.caseId}`);
    }
    if (observationsById.has(observation.caseId)) {
      throw new Error(`Duplicate observation for case: ${observation.caseId}`);
    }
    observationsById.set(observation.caseId, observation);
  }

  const paired = cases.map((benchmarkCase) => {
    const observation = observationsById.get(benchmarkCase.id);
    if (!observation) throw new Error(`Missing observation for case: ${benchmarkCase.id}`);
    return { benchmarkCase, observation };
  });
  const measured = paired.filter(({ observation }) => observation.routingMeasured);

  let exactMatches = 0;
  let requiredSelected = 0;
  let requiredTotal = 0;
  let forbiddenAvoided = 0;
  let forbiddenTotal = 0;
  let digitalSafetySelected = 0;
  let digitalSafetyRequired = 0;

  for (const { benchmarkCase, observation } of measured) {
    if (sameSet(observation.selectedAgents, benchmarkCase.expected.requiredAgents)) {
      exactMatches += 1;
    }
    for (const specialist of benchmarkCase.expected.requiredAgents) {
      requiredTotal += 1;
      if (selected(observation, specialist)) requiredSelected += 1;
    }
    for (const specialist of benchmarkCase.expected.forbiddenAgents) {
      forbiddenTotal += 1;
      if (!selected(observation, specialist)) forbiddenAvoided += 1;
    }
    if (benchmarkCase.expected.digitalSafetyRequired) {
      digitalSafetyRequired += 1;
      if (selected(observation, "digital_safety")) digitalSafetySelected += 1;
    }
  }

  const proposedDurableContext = paired.filter(
    ({ observation }) => observation.durableContextProposed
  );
  const validDurableContext = proposedDurableContext.filter(
    ({ benchmarkCase }) => benchmarkCase.expected.durableContextAllowed
  );

  const failedCaseIds = paired
    .filter(({ benchmarkCase, observation }) => {
      const routingFailed =
        observation.routingMeasured &&
        (!sameSet(observation.selectedAgents, benchmarkCase.expected.requiredAgents) ||
          benchmarkCase.expected.forbiddenAgents.some((agent) => selected(observation, agent)));
      const memoryFailed =
        observation.durableContextProposed &&
        !benchmarkCase.expected.durableContextAllowed;
      return (
        routingFailed ||
        memoryFailed ||
        observation.humanFollowUpActual !== benchmarkCase.expected.humanFollowUpExpected ||
        !benchmarkCase.expected.allowedRisk.includes(observation.finalRisk) ||
        !observation.schemaValid ||
        observation.fallback
      );
    })
    .map(({ benchmarkCase }) => benchmarkCase.id);

  const durations = paired
    .map(({ observation }) => observation.durationMs)
    .sort((left, right) => left - right);

  return {
    caseCount: paired.length,
    routeExactMatchRate: divide(exactMatches, measured.length),
    requiredSpecialistRecall: divide(requiredSelected, requiredTotal),
    forbiddenSpecialistAvoidance: divide(forbiddenAvoided, forbiddenTotal),
    digitalSafetyRecall: divide(digitalSafetySelected, digitalSafetyRequired),
    durableContextPrecision: divide(
      validDurableContext.length,
      proposedDurableContext.length
    ),
    schemaValidRate:
      paired.filter(({ observation }) => observation.schemaValid).length / paired.length,
    fallbackRate:
      paired.filter(({ observation }) => observation.fallback).length / paired.length,
    medianLatencyMs: median(durations),
    p95LatencyMs: nearestRankP95(durations),
    failedCaseIds,
  };
}
