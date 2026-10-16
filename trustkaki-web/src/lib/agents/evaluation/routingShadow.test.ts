import { describe, expect, it } from "vitest";
import { buildRoutingShadowRequest, fictionalRoutingContext, parseRoutingShadowResponse, routingFlags,
  routingShadowHash, scoreRoutingShadow, summarizeRoutingShadow, triageRoutingJudgment, type RoutingJudgment } from "./routingShadow";
import { routingShadowCases } from "./routingShadowCases";

const none = (): RoutingJudgment => ({ health: "absent", daily_living: "absent", digital_safety: "absent",
  social: "absent", durable_context: "absent", urgent: "absent" });
function response() {
  return { model: "typesafe/jev-1.14-20261014", usage: { input_tokens: 100, output_tokens: 0, cost: 0.0000042 },
    answers: Object.fromEntries(routingFlags.map(flag => [flag, { type: "choice", choice: "absent", confidence: 1,
      probabilities: { present: 0, absent: 1, unclear: 0 } }])) };
}

describe("routing shadow preparation (no provider calls)", () => {
  it("separates all six questions and supplies the same current message and context", () => {
    const item = routingShadowCases.find(c => c.family === "08")!;
    const request = buildRoutingShadowRequest(item.message, item.context);
    expect(Object.keys(request.questions)).toEqual([...routingFlags]);
    expect(request.state).toEqual({ current_message: item.message, context: item.context });
    expect(request.model).toBe("typesafe/jev-1.14");
    expect(item.expected.health).toBe("present");
    expect(item.expected.urgent).toBe("present");
    expect(item.expected.digital_safety).toBe("present");
  });

  it("bounds current message and complete context instead of silently truncating", () => {
    expect(() => buildRoutingShadowRequest("x".repeat(1001), fictionalRoutingContext())).toThrow();
    expect(() => buildRoutingShadowRequest("", fictionalRoutingContext())).toThrow();
    const context = fictionalRoutingContext();
    context.senior.name = "x".repeat(12001);
    expect(() => buildRoutingShadowRequest("hello", context)).toThrow("routing_shadow_context_too_large");
  });

  it("parses complete probability distributions and retains per-question uncertainty", () => {
    const parsed = parseRoutingShadowResponse(response());
    expect(parsed.judgment).toEqual(none());
    expect(parsed.model).toBe("typesafe/jev-1.14-20261014");
    const value = response();
    value.answers.health = { type: "choice", choice: "unclear", confidence: 0.25,
      probabilities: { present: 0.25, absent: 0.25, unclear: 0.5 } };
    expect(parseRoutingShadowResponse(value).judgment.health).toBe("unclear");
  });

  it("rejects wrong models, missing answers, unsupported labels and inconsistent probabilities", () => {
    const wrongModel = response(); wrongModel.model = "typesafe/jev-2";
    expect(() => parseRoutingShadowResponse(wrongModel)).toThrow();
    const missing = response(); delete missing.answers.urgent;
    expect(() => parseRoutingShadowResponse(missing)).toThrow();
    const wrongLabel = response(); wrongLabel.answers.urgent.choice = "safe";
    expect(() => parseRoutingShadowResponse(wrongLabel)).toThrow();
    const sum = response(); sum.answers.health.probabilities.present = 0.5;
    expect(() => parseRoutingShadowResponse(sum)).toThrow();
    const winner = response(); winner.answers.health.choice = "present";
    expect(() => parseRoutingShadowResponse(winner)).toThrow();
  });

  it("adapts validated Triage fields without treating its suggested risk or response as routing evidence", () => {
    const triage = { signals: [{ type: "health", category: "emergency_high_risk", severity: "high", description: "Fictional urgent concern" }],
      routing: ["digital_safety", "context_memory"], riskLevel: "red", riskChange: "increase", summary: "Fictional summary",
      responseMessage: "Would you like an activity?", humanFollowUpRequired: true };
    expect(triageRoutingJudgment({ data: triage, fallback: false })).toEqual({ ...none(), health: "present", urgent: "present",
      digital_safety: "present", durable_context: "present" });
    expect(triageRoutingJudgment({ data: { ...triage, signals: [], routing: [] }, fallback: false })).toEqual(none());
    expect(() => triageRoutingJudgment({ data: { ...triage, signals: [], routing: [] }, fallback: true })).toThrow();
    expect(() => triageRoutingJudgment(triage)).toThrow();
    expect(triageRoutingJudgment({ data: { ...triage, routing: [], signals: [{ type: "social", category: "caregiver_aac_escalation",
      severity: "medium", description: "Generic caregiver follow-up, no social participation concern" }] }, fallback: false }).social).toBe("absent");
  });

  it("counts abstention on a positive as a missed concern, not a correct negative", () => {
    const item = routingShadowCases.find(c => c.family === "08")!;
    const prediction = { ...item.expected, urgent: "unclear" as const };
    const score = scoreRoutingShadow([item], [prediction]);
    expect(score.byFlag.urgent).toMatchObject({ correct: 0, falseNegative: 1, abstentions: 1, coverage: 0 });
    expect(score.byFlag.urgent.recall).toBe(0);
    expect(score.missedUrgentOrScamPositives).toBe(1);
    expect(score.exactCases).toBe(0);
    expect(() => scoreRoutingShadow([item], [])).toThrow();
  });

  it("counts false positives and preserves explicit expected ambiguity", () => {
    const plain = routingShadowCases.find(c => c.family === "06")!;
    expect(scoreRoutingShadow([plain], [{ ...none(), urgent: "present" }]).byFlag.urgent.falsePositive).toBe(1);
    const ambiguous = routingShadowCases.find(c => c.family === "12")!;
    const score = scoreRoutingShadow([ambiguous], [ambiguous.expected]);
    expect(score.exactCases).toBe(1);
    expect(score.byFlag.health).toMatchObject({ correct: 1, expectedUnclear: 1, abstentions: 1, coverage: 0 });
  });

  it("keeps translations together and reports independent semantic-family counts", () => {
    expect(routingShadowCases).toHaveLength(36);
    expect(new Set(routingShadowCases.map(c => c.id)).size).toBe(36);
    for (const family of new Set(routingShadowCases.map(c => c.family))) {
      const subset = routingShadowCases.filter(c => c.family === family);
      expect(new Set(subset.map(c => c.split)).size).toBe(1);
      expect(new Set(subset.map(c => c.language)).size).toBe(3);
    }
    const held = routingShadowCases.filter(c => c.split === "held_out");
    expect(held.some(c => c.expected.daily_living === "present")).toBe(true);
    expect(routingShadowCases.find(c => c.family === "12")!.expected.durable_context).toBe("absent");
    expect(scoreRoutingShadow(held, held.map(c => c.expected))).toMatchObject({ cases: 18, semanticFamilies: 6, exactCases: 18 });
    expect(routingShadowHash(routingShadowCases)).toMatch(/^[a-f0-9]{64}$/);
    const changed = structuredClone(routingShadowCases); changed[0].message += " changed";
    expect(routingShadowHash(changed)).not.toBe(routingShadowHash(routingShadowCases));
  });

  it("reports split/language/family groups without treating missing positive examples as perfect recall", () => {
    const report = summarizeRoutingShadow(routingShadowCases, routingShadowCases.map(c => c.expected));
    expect(report.byLanguage.Mandarin.cases).toBe(12);
    expect(report.bySplit.held_out.semanticFamilies).toBe(6);
    expect(report.byFamily["06"].byFlag.urgent.recall).toBeNull();
    expect(report.bySplit.held_out.byFlag.daily_living.recall).toBe(1);
  });
});
