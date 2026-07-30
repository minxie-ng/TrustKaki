import type { AgentRunContext, OrchestrationResult } from "@/lib/agents/contracts";
import { orchestrate } from "@/lib/agents/orchestrator";
import {
  benchmarkSpecialists,
  type BenchmarkCase,
  type BenchmarkObservation,
  type BenchmarkSpecialist,
} from "./contracts";

export type OrchestrationRunner = (
  message: string,
  context: AgentRunContext
) => Promise<OrchestrationResult>;

function fixedFictionalContext(benchmarkCase: BenchmarkCase): AgentRunContext {
  return {
    senior: {
      name: "Fictional Senior",
      age: 76,
      livingSituation: "Fictional independent-living scenario",
      caregiver: "Fictional Caregiver",
      aacVolunteer: "Fictional AAC Volunteer",
    },
    messages: [
      {
        id: `benchmark-${benchmarkCase.id}`,
        sender: "senior",
        text: benchmarkCase.message,
        timestamp: "2026-07-30T00:00:00.000Z",
      },
    ],
    currentRiskLevel: benchmarkCase.policyFixture.currentRiskLevel,
  };
}

function selectedSpecialists(result: OrchestrationResult): BenchmarkSpecialist[] {
  const allowed = new Set<string>(benchmarkSpecialists);
  const selected = new Set<BenchmarkSpecialist>();
  for (const trace of result.traces) {
    if (allowed.has(trace.agentId)) selected.add(trace.agentId as BenchmarkSpecialist);
  }
  return [...selected];
}

function errorCategory(error: unknown): string {
  const message = error instanceof Error ? error.message.toLowerCase() : "";
  if (message.includes("timeout") || message.includes("timed out")) {
    return "provider_timeout";
  }
  if (message.includes("schema") || message.includes("invalid")) {
    return "invalid_output";
  }
  return "provider_error";
}

export async function evaluateLiveCase(
  benchmarkCase: BenchmarkCase,
  runOrchestration: OrchestrationRunner = orchestrate
): Promise<BenchmarkObservation> {
  const startedAt = performance.now();

  try {
    const result = await runOrchestration(
      benchmarkCase.message,
      fixedFictionalContext(benchmarkCase)
    );
    return {
      caseId: benchmarkCase.id,
      mode: "live",
      routingMeasured: true,
      selectedAgents: selectedSpecialists(result),
      humanFollowUpActual: result.policy.briefingRequired,
      finalRisk: result.policy.finalRisk,
      durableContextProposed: result.contextMemoryCandidates.length > 0,
      schemaValid: true,
      fallback: result.traces.some((trace) => trace.fallback === true),
      durationMs: Math.max(0, performance.now() - startedAt),
      errorCategory: null,
    };
  } catch (error) {
    return {
      caseId: benchmarkCase.id,
      mode: "live",
      routingMeasured: true,
      selectedAgents: [],
      humanFollowUpActual: false,
      finalRisk: benchmarkCase.policyFixture.currentRiskLevel,
      durableContextProposed: false,
      schemaValid: false,
      fallback: true,
      durationMs: Math.max(0, performance.now() - startedAt),
      errorCategory: errorCategory(error),
    };
  }
}
