import { describe, expect, it } from "vitest";
import { benchmarkCases } from "./cases";
import type { BenchmarkCase, BenchmarkObservation } from "./contracts";
import { scoreBenchmark } from "./scoring";

function perfectObservation(
  benchmarkCase: BenchmarkCase,
  durationMs: number
): BenchmarkObservation {
  return {
    caseId: benchmarkCase.id,
    mode: "live",
    routingMeasured: true,
    selectedAgents: [...benchmarkCase.expected.requiredAgents],
    humanFollowUpActual: benchmarkCase.expected.humanFollowUpExpected,
    finalRisk: benchmarkCase.expected.allowedRisk[0],
    durableContextProposed: benchmarkCase.expected.durableContextAllowed,
    schemaValid: true,
    fallback: false,
    durationMs,
    errorCategory: null,
  };
}

describe("scoreBenchmark", () => {
  it("returns exact perfect metrics with sample counts and nearest-rank p95", () => {
    const cases = [
      benchmarkCases.find((item) => item.category === "benign")!,
      benchmarkCases.find((item) => item.category === "digital_safety")!,
      benchmarkCases.find((item) => item.category === "durable_context")!,
    ];
    const observations = cases.map((item, index) =>
      perfectObservation(item, [10, 20, 30][index])
    );

    expect(scoreBenchmark(cases, observations)).toEqual({
      caseCount: 3,
      routeExactMatchRate: 1,
      requiredSpecialistRecall: 1,
      forbiddenSpecialistAvoidance: 1,
      digitalSafetyRecall: 1,
      durableContextPrecision: 1,
      schemaValidRate: 1,
      fallbackRate: 0,
      medianLatencyMs: 20,
      p95LatencyMs: 30,
      failedCaseIds: [],
    });
  });

  it("scores missed required and selected forbidden specialists", () => {
    const socialCase = benchmarkCases.find((item) => item.category === "social")!;
    const observation: BenchmarkObservation = {
      ...perfectObservation(socialCase, 12),
      selectedAgents: ["triage", "digital_safety"],
      durableContextProposed: true,
      schemaValid: false,
      fallback: true,
    };

    expect(scoreBenchmark([socialCase], [observation])).toMatchObject({
      routeExactMatchRate: 0,
      requiredSpecialistRecall: 0.5,
      forbiddenSpecialistAvoidance: 0.5,
      digitalSafetyRecall: null,
      durableContextPrecision: 0,
      schemaValidRate: 0,
      fallbackRate: 1,
      failedCaseIds: [socialCase.id],
    });
  });

  it("does not claim routing metrics for deterministic observations", () => {
    const benchmarkCase = benchmarkCases[0];
    const observation = {
      ...perfectObservation(benchmarkCase, 5),
      mode: "deterministic" as const,
      routingMeasured: false,
    };

    expect(scoreBenchmark([benchmarkCase], [observation])).toMatchObject({
      routeExactMatchRate: null,
      requiredSpecialistRecall: null,
      forbiddenSpecialistAvoidance: null,
      digitalSafetyRecall: null,
    });
  });

  it("rejects missing or duplicate observations", () => {
    const benchmarkCase = benchmarkCases[0];
    const observation = perfectObservation(benchmarkCase, 5);

    expect(() => scoreBenchmark([benchmarkCase], [])).toThrow("Missing observation");
    expect(() => scoreBenchmark([benchmarkCase], [observation, observation])).toThrow(
      "Duplicate observation"
    );
  });
});
