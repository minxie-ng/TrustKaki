import { describe, expect, it, vi } from "vitest";
import type { AgentTrace } from "@/lib/types";
import type { OrchestrationResult } from "@/lib/agents/contracts";
import { benchmarkCases } from "./cases";
import { evaluateLiveCase } from "./live";

function trace(agentId: AgentTrace["agentId"], fallback = false): AgentTrace {
  return {
    id: `trace-${agentId}`,
    agentId,
    agentName: agentId,
    timestamp: "2026-07-30T00:00:00.000Z",
    input: "fictional input",
    reasoning: "fictional reasoning",
    output: "fictional output",
    tags: [],
    fallback,
  };
}

function result(traces: AgentTrace[]): OrchestrationResult {
  return {
    messages: [],
    traces,
    alerts: [],
    riskLevel: "yellow",
    riskChange: "increase",
    signals: [],
    policy: {
      finalRisk: "yellow",
      riskChange: "increase",
      briefingRequired: true,
      alerts: [],
      reasoning: ["Synthetic policy result"],
    },
    briefing: null,
    contextMemoryCandidates: [
      {
        targetStore: "memory",
        contextKey: "preferred_language",
        contextType: "communication_preference",
        content: "Prefers Mandarin calls",
        sourceMessageId: "benchmark-message",
        evidenceExcerpt: "Prefers calls in Mandarin",
        confidence: 0.95,
        applicationTags: ["voice_preferred"],
        retentionClass: "preference",
      },
    ],
  };
}

describe("evaluateLiveCase", () => {
  it("scores only specialist traces and keeps policy risk authoritative", async () => {
    const benchmarkCase = benchmarkCases.find(
      (item) => item.category === "durable_context"
    )!;
    const run = vi.fn().mockResolvedValue(
      result([
        trace("orchestrator"),
        trace("triage"),
        trace("context_memory"),
        trace("policy"),
        trace("pattern_watch"),
        trace("briefing", true),
      ])
    );

    await expect(evaluateLiveCase(benchmarkCase, run)).resolves.toMatchObject({
      mode: "live",
      routingMeasured: true,
      selectedAgents: ["triage", "context_memory"],
      finalRisk: "yellow",
      humanFollowUpActual: true,
      durableContextProposed: true,
      schemaValid: true,
      fallback: true,
      errorCategory: null,
    });
    expect(run).toHaveBeenCalledOnce();
  });

  it("returns a bounded error category without leaking provider details", async () => {
    const benchmarkCase = benchmarkCases[0];
    const run = vi
      .fn()
      .mockRejectedValue(new Error("Provider failed with secret response body"));

    const observation = await evaluateLiveCase(benchmarkCase, run);

    expect(observation).toMatchObject({
      schemaValid: false,
      fallback: true,
      errorCategory: "provider_error",
    });
    expect(JSON.stringify(observation)).not.toContain("secret response body");
  });
});
