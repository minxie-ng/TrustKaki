import { z } from "zod";
import type { RiskLevel } from "@/lib/types";
import type { DigitalSafetyOutput, TriageSignal } from "@/lib/agents/contracts";

export const benchmarkCategories = [
  "care",
  "social",
  "digital_safety",
  "durable_context",
  "benign",
  "protected_data",
] as const;

export const benchmarkSpecialists = [
  "triage",
  "aac_nudge",
  "digital_safety",
  "context_memory",
] as const;

export type BenchmarkCategory = (typeof benchmarkCategories)[number];
export type BenchmarkSpecialist = (typeof benchmarkSpecialists)[number];

export interface BenchmarkCase {
  id: string;
  category: BenchmarkCategory;
  message: string;
  ambiguous: boolean;
  expected: {
    requiredAgents: BenchmarkSpecialist[];
    forbiddenAgents: BenchmarkSpecialist[];
    digitalSafetyRequired: boolean;
    durableContextAllowed: boolean;
    humanFollowUpExpected: boolean;
    allowedRisk: RiskLevel[];
  };
  policyFixture: {
    signals: TriageSignal[];
    triageRiskLevel: RiskLevel;
    triageRiskChange: "none" | "increase" | "decrease";
    humanFollowUpRequired: boolean;
    currentRiskLevel: RiskLevel;
    digitalSafety: DigitalSafetyOutput | null;
  };
}

export interface BenchmarkObservation {
  caseId: string;
  mode: "deterministic" | "live";
  routingMeasured: boolean;
  selectedAgents: BenchmarkSpecialist[];
  humanFollowUpActual: boolean;
  finalRisk: RiskLevel;
  durableContextProposed: boolean;
  schemaValid: boolean;
  fallback: boolean;
  durationMs: number;
  errorCategory: string | null;
}

const riskLevelSchema = z.enum(["green", "yellow", "red"]);
const specialistSchema = z.enum(benchmarkSpecialists);
const triageSignalSchema = z
  .object({
    type: z.enum(["health", "daily_living", "digital_safety", "social"]),
    category: z
      .enum([
        "daily_living",
        "health_frailty_signal",
        "social_isolation",
        "digital_safety",
        "caregiver_aac_escalation",
        "emergency_high_risk",
      ])
      .optional(),
    description: z.string().trim().min(1),
    severity: z.enum(["low", "medium", "high"]),
  })
  .strict();

const digitalSafetySchema = z
  .object({
    isScam: z.boolean(),
    scamType: z.string().nullable(),
    confidence: z.number().min(0).max(1),
    warningMessage: z.string(),
    educationalNote: z.string(),
  })
  .strict();

const benchmarkCaseSchema = z
  .object({
    id: z.string().trim().min(1),
    category: z.enum(benchmarkCategories),
    message: z.string().trim().min(1),
    ambiguous: z.boolean(),
    expected: z
      .object({
        requiredAgents: z.array(specialistSchema),
        forbiddenAgents: z.array(specialistSchema),
        digitalSafetyRequired: z.boolean(),
        durableContextAllowed: z.boolean(),
        humanFollowUpExpected: z.boolean(),
        allowedRisk: z.array(riskLevelSchema).min(1),
      })
      .strict(),
    policyFixture: z
      .object({
        signals: z.array(triageSignalSchema),
        triageRiskLevel: riskLevelSchema,
        triageRiskChange: z.enum(["none", "increase", "decrease"]),
        humanFollowUpRequired: z.boolean(),
        currentRiskLevel: riskLevelSchema,
        digitalSafety: digitalSafetySchema.nullable(),
      })
      .strict(),
  })
  .strict();

function duplicateValue(values: readonly string[]): string | null {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) return value;
    seen.add(value);
  }
  return null;
}

export function validateBenchmarkCases(cases: unknown): BenchmarkCase[] {
  const parsed = z.array(benchmarkCaseSchema).parse(cases) as BenchmarkCase[];
  const seenIds = new Set<string>();

  for (const item of parsed) {
    if (seenIds.has(item.id)) {
      throw new Error(`Duplicate benchmark case id: ${item.id}`);
    }
    if (!item.expected.requiredAgents.includes("triage")) {
      throw new Error(`Benchmark case ${item.id} must require triage`);
    }

    const duplicateRequired = duplicateValue(item.expected.requiredAgents);
    if (duplicateRequired) {
      throw new Error(`Benchmark case ${item.id} repeats required agent ${duplicateRequired}`);
    }
    const duplicateForbidden = duplicateValue(item.expected.forbiddenAgents);
    if (duplicateForbidden) {
      throw new Error(`Benchmark case ${item.id} repeats forbidden agent ${duplicateForbidden}`);
    }

    const overlap = item.expected.requiredAgents.find((agent) =>
      item.expected.forbiddenAgents.includes(agent)
    );
    if (overlap) {
      throw new Error(`Benchmark case ${item.id} cannot both require and forbid ${overlap}`);
    }

    seenIds.add(item.id);
  }

  return parsed;
}
