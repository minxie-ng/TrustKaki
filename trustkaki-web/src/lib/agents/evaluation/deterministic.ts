import { mayContainDurableContext } from "@/lib/agents/orchestrator";
import { applyPolicy } from "@/lib/agents/policy";
import type { BenchmarkCase, BenchmarkObservation } from "./contracts";

export function evaluateDeterministicCase(
  benchmarkCase: BenchmarkCase
): BenchmarkObservation {
  const startedAt = performance.now();
  const policy = applyPolicy({
    ...benchmarkCase.policyFixture,
    message: benchmarkCase.message,
  });

  return {
    caseId: benchmarkCase.id,
    mode: "deterministic",
    routingMeasured: false,
    selectedAgents: ["triage"],
    humanFollowUpActual: policy.briefingRequired,
    finalRisk: policy.finalRisk,
    durableContextProposed: mayContainDurableContext(benchmarkCase.message),
    schemaValid: true,
    fallback: false,
    durationMs: Math.max(0, performance.now() - startedAt),
    errorCategory: null,
  };
}
