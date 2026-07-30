import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { benchmarkCases } from "@/lib/agents/evaluation/cases";
import type {
  BenchmarkCase,
  BenchmarkCategory,
  BenchmarkObservation,
} from "@/lib/agents/evaluation/contracts";
import { evaluateDeterministicCase } from "@/lib/agents/evaluation/deterministic";
import { evaluateLiveCase } from "@/lib/agents/evaluation/live";
import {
  scoreBenchmark,
  type BenchmarkMetrics,
} from "@/lib/agents/evaluation/scoring";

type BenchmarkMode = "deterministic" | "live";

export interface BenchmarkArgs {
  mode: BenchmarkMode;
  confirmLive: boolean;
  limit: number;
  output: string | null;
}

export interface BenchmarkReportInput {
  mode: BenchmarkMode;
  generatedAt: string;
  modelName: string;
  metrics: BenchmarkMetrics;
}

const maxCaseCount = 42;

export function parseBenchmarkArgs(argv: readonly string[]): BenchmarkArgs {
  let mode: BenchmarkMode = "deterministic";
  let confirmLive = false;
  let limit = maxCaseCount;
  let output: string | null = null;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--confirm-live") {
      confirmLive = true;
      continue;
    }

    const value = argv[index + 1];
    if (argument === "--mode") {
      if (value !== "deterministic" && value !== "live") {
        throw new Error("--mode must be deterministic or live");
      }
      mode = value;
      index += 1;
      continue;
    }
    if (argument === "--limit") {
      const parsed = Number(value);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxCaseCount) {
        throw new Error("--limit must be an integer from 1 through 42");
      }
      limit = parsed;
      index += 1;
      continue;
    }
    if (argument === "--output") {
      if (!value || value.startsWith("--")) {
        throw new Error("--output requires a file path");
      }
      output = value;
      index += 1;
      continue;
    }
    throw new Error(`Unknown benchmark argument: ${argument}`);
  }

  if (mode === "live" && !confirmLive) {
    throw new Error("Live mode requires --confirm-live");
  }

  return { mode, confirmLive, limit, output };
}

export function selectBenchmarkCases(
  cases: readonly BenchmarkCase[],
  mode: BenchmarkMode,
  limit: number
): BenchmarkCase[] {
  if (mode === "deterministic") return cases.slice(0, limit);

  const categories = [...new Set(cases.map((item) => item.category))];
  const grouped = new Map<BenchmarkCategory, BenchmarkCase[]>(
    categories.map((category) => [
      category,
      cases.filter((item) => item.category === category),
    ])
  );
  const selected: BenchmarkCase[] = [];

  for (let round = 0; selected.length < limit; round += 1) {
    let added = false;
    for (const category of categories) {
      const candidate = grouped.get(category)?.[round];
      if (candidate && selected.length < limit) {
        selected.push(candidate);
        added = true;
      }
    }
    if (!added) break;
  }

  return selected;
}

function percentage(value: number | null): string {
  return value === null ? "Not measured" : `${(value * 100).toFixed(1)}%`;
}

export function renderBenchmarkMarkdown(input: BenchmarkReportInput): string {
  const { metrics } = input;
  const modeLabel =
    input.mode === "deterministic" ? "Deterministic (offline)" : "Live (bounded)";
  const failed = metrics.failedCaseIds.length
    ? metrics.failedCaseIds.join(", ")
    : "None";

  return [
    "# TrustKaki Agent Benchmark",
    "",
    "All inputs are fictional; no persistence or messaging was used.",
    "",
    "| Run detail | Value |",
    "| --- | --- |",
    `| Mode | ${modeLabel} |`,
    `| Generated | ${input.generatedAt} |`,
    `| Model | ${input.modelName} |`,
    `| Case count | ${metrics.caseCount} |`,
    "",
    "| Metric | Result |",
    "| --- | --- |",
    `| Route exact-match rate | ${percentage(metrics.routeExactMatchRate)} |`,
    `| Required-specialist recall | ${percentage(metrics.requiredSpecialistRecall)} |`,
    `| Forbidden-specialist avoidance | ${percentage(metrics.forbiddenSpecialistAvoidance)} |`,
    `| Digital Safety recall | ${percentage(metrics.digitalSafetyRecall)} |`,
    `| Durable-context precision | ${percentage(metrics.durableContextPrecision)} |`,
    `| Schema-valid response rate | ${percentage(metrics.schemaValidRate)} |`,
    `| Fallback rate | ${percentage(metrics.fallbackRate)} |`,
    `| Median latency | ${metrics.medianLatencyMs.toFixed(1)} ms |`,
    `| P95 latency | ${metrics.p95LatencyMs.toFixed(1)} ms |`,
    "",
    `Failed case IDs: ${failed}`,
    "",
  ].join("\n");
}

async function runBenchmark(args: BenchmarkArgs): Promise<string> {
  const selectedCases = selectBenchmarkCases(benchmarkCases, args.mode, args.limit);
  const observations: BenchmarkObservation[] = [];

  for (const benchmarkCase of selectedCases) {
    const observation =
      args.mode === "deterministic"
        ? evaluateDeterministicCase(benchmarkCase)
        : await evaluateLiveCase(benchmarkCase);
    observations.push(observation);
    console.log(`[${benchmarkCase.id}] complete`);
  }

  return renderBenchmarkMarkdown({
    mode: args.mode,
    generatedAt: new Date().toISOString(),
    modelName:
      args.mode === "live"
        ? process.env.TRUSTKAKI_LLM_MODEL || "configured provider default"
        : "not used",
    metrics: scoreBenchmark(selectedCases, observations),
  });
}

async function main(): Promise<void> {
  const args = parseBenchmarkArgs(process.argv.slice(2));
  const report = await runBenchmark(args);

  if (args.output) {
    await mkdir(dirname(args.output), { recursive: true });
    await writeFile(args.output, report, "utf8");
    console.log(`Report written: ${args.output}`);
    return;
  }

  console.log(report);
}

const entrypoint = process.argv[1] ? pathToFileURL(process.argv[1]).href : "";
if (import.meta.url === entrypoint) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Benchmark failed";
    console.error(message);
    process.exitCode = 1;
  });
}
