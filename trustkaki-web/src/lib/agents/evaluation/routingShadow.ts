import { createHash } from "node:crypto";
import type { AgentRunContext } from "../contracts";
import { buildRoutingShadowRequest, routingFlags, routingJudgmentSchema as judgmentSchema,
  type RoutingFlag, type RoutingJudgment } from "../routingContract";
export { buildRoutingShadowRequest, parseRoutingShadowResponse, routingFlags, routingLabels,
  triageRoutingJudgment, type RoutingFlag, type RoutingLabel, type RoutingJudgment } from "../routingContract";

// Evaluation only: production code imports the shared contract, never the corpus/scorer.
export interface RoutingShadowCase {
  id: string; family: string; language: "English" | "Mandarin" | "Singlish";
  split: "development" | "held_out"; message: string; context: AgentRunContext; expected: RoutingJudgment;
}

export function routingShadowHash(cases: RoutingShadowCase[]) {
  return createHash("sha256").update(JSON.stringify({ cases,
    questions: buildRoutingShadowRequest("hash only", cases[0]?.context ?? fictionalRoutingContext()).questions,
  })).digest("hex");
}

export function fictionalRoutingContext(): AgentRunContext {
  return { senior: { name: "Fictional routing senior", age: 76, livingSituation: "Fictional independent living",
    caregiver: "Fictional caregiver", aacVolunteer: "Fictional volunteer" }, messages: [], currentRiskLevel: "green" };
}

export function scoreRoutingShadow(cases: RoutingShadowCase[], predictions: RoutingJudgment[]) {
  if (!cases.length || cases.length !== predictions.length) throw new Error("routing_shadow_prediction_count");
  const validated = predictions.map(p => judgmentSchema.parse(p));
  const byFlag = Object.fromEntries(routingFlags.map(flag => {
    let correct = 0, falsePositive = 0, falseNegative = 0, abstentions = 0, expectedUnclear = 0, positives = 0;
    cases.forEach((item, i) => {
      const expected = item.expected[flag], actual = validated[i][flag];
      if (actual === expected) correct++;
      if (actual === "unclear") abstentions++;
      if (expected === "unclear") expectedUnclear++;
      if (expected === "present") positives++;
      if (expected === "absent" && actual === "present") falsePositive++;
      if (expected === "present" && actual !== "present") falseNegative++;
    });
    return [flag, { correct, total: cases.length, falsePositive, falseNegative, abstentions, expectedUnclear, positives,
      recall: positives ? (positives - falseNegative) / positives : null, coverage: (cases.length - abstentions) / cases.length }];
  })) as Record<RoutingFlag, { correct: number; total: number; falsePositive: number; falseNegative: number;
    abstentions: number; expectedUnclear: number; positives: number; recall: number | null; coverage: number }>;
  return { cases: cases.length, semanticFamilies: new Set(cases.map(c => c.family)).size,
    exactCases: cases.filter((item, i) => routingFlags.every(flag => item.expected[flag] === validated[i][flag])).length,
    missedUrgentOrScamPositives: byFlag.urgent.falseNegative + byFlag.digital_safety.falseNegative,
    byFlag };
}

export function summarizeRoutingShadow(cases: RoutingShadowCase[], predictions: RoutingJudgment[]) {
  const overall = scoreRoutingShadow(cases, predictions);
  const groups = (key: "split" | "language" | "family") => Object.fromEntries(
    [...new Set(cases.map(c => c[key]))].map(value => {
      const indices = cases.flatMap((c, i) => c[key] === value ? [i] : []);
      return [value, scoreRoutingShadow(indices.map(i => cases[i]), indices.map(i => predictions[i]))];
    }));
  return { overall, bySplit: groups("split"), byLanguage: groups("language"), byFamily: groups("family") };
}
