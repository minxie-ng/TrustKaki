import { describe, expect, it } from "vitest";
import { benchmarkCases } from "@/lib/agents/evaluation/cases";
import type { BenchmarkMetrics } from "@/lib/agents/evaluation/scoring";
import {
  parseBenchmarkArgs,
  renderBenchmarkMarkdown,
  selectBenchmarkCases,
} from "./agent-benchmark";

const metrics: BenchmarkMetrics = {
  caseCount: 18,
  routeExactMatchRate: 0.9,
  requiredSpecialistRecall: 0.95,
  forbiddenSpecialistAvoidance: 1,
  digitalSafetyRecall: 1,
  durableContextPrecision: 0.8,
  schemaValidRate: 1,
  fallbackRate: 0.05,
  medianLatencyMs: 1200,
  p95LatencyMs: 2400,
  failedCaseIds: ["care_01"],
};

describe("parseBenchmarkArgs", () => {
  it("defaults to a full deterministic run", () => {
    expect(parseBenchmarkArgs([])).toEqual({
      mode: "deterministic",
      confirmLive: false,
      limit: 42,
      output: null,
    });
  });

  it("requires explicit confirmation for live calls", () => {
    expect(() => parseBenchmarkArgs(["--mode", "live"])).toThrow(
      "Live mode requires --confirm-live"
    );
    expect(
      parseBenchmarkArgs(["--mode", "live", "--confirm-live", "--limit", "18"])
    ).toMatchObject({ mode: "live", confirmLive: true, limit: 18 });
  });

  it("rejects limits outside the committed case count", () => {
    expect(() => parseBenchmarkArgs(["--limit", "0"])).toThrow(
      "--limit must be an integer from 1 through 42"
    );
    expect(() => parseBenchmarkArgs(["--limit", "43"])).toThrow(
      "--limit must be an integer from 1 through 42"
    );
  });
});

describe("selectBenchmarkCases", () => {
  it("selects bounded live cases evenly across categories", () => {
    const selected = selectBenchmarkCases(benchmarkCases, "live", 18);
    const counts = new Map<string, number>();
    for (const item of selected) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }

    expect(selected).toHaveLength(18);
    expect([...counts.values()]).toEqual([3, 3, 3, 3, 3, 3]);
  });
});

describe("renderBenchmarkMarkdown", () => {
  it("renders aggregate evidence without case messages or provider content", () => {
    const report = renderBenchmarkMarkdown({
      mode: "live",
      generatedAt: "2026-07-30T00:00:00.000Z",
      modelName: "benchmark-model",
      metrics,
    });

    expect(report).toContain("All inputs are fictional; no persistence or messaging was used.");
    expect(report).toContain("Route exact-match rate | 90.0%");
    expect(report).toContain("care_01");
    expect(report).not.toContain(benchmarkCases[0].message);
    expect(report).not.toMatch(/prompt|trace[_ -]?id|api[_ -]?key|response body/i);
  });

  it("labels unmeasured routing metrics instead of implying accuracy", () => {
    const report = renderBenchmarkMarkdown({
      mode: "deterministic",
      generatedAt: "2026-07-30T00:00:00.000Z",
      modelName: "not used",
      metrics: {
        ...metrics,
        routeExactMatchRate: null,
        requiredSpecialistRecall: null,
        forbiddenSpecialistAvoidance: null,
        digitalSafetyRecall: null,
      },
    });

    expect(report).toContain("Route exact-match rate | Not measured");
    expect(report).toContain("Mode | Deterministic (offline)");
  });
});
