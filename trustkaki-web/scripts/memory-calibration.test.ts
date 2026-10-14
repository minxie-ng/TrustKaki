import { expect, it } from "vitest";
import { cosine, selectThreshold, calibrationQuestions } from "./memory-calibration";
import { pilotQuestions } from "../src/lib/agents/evaluation/memoryRetrievalCases";
it("calculates cosine with finite nonzero vectors of the same dimension", () => {
  expect(cosine([1, 0], [1, 0])).toBe(1);
  expect(cosine([1, 0], [0, 1])).toBe(0);
  expect(() => cosine([0, 0], [1, 0])).toThrow();
  expect(() => cosine([1], [1, 0])).toThrow();
  expect(() => cosine([NaN], [1])).toThrow();
});
it("selects a separating midpoint only when every positive beats every forbidden score", () => {
  expect(selectThreshold([0.8, 0.7], [0.2, 0.4])).toBeCloseTo(0.55);
  expect(selectThreshold([0.4], [0.4])).toBeNull();
  expect(selectThreshold([0.3], [0.4])).toBeNull();
  expect(() => selectThreshold([], [0.2])).toThrow();
  expect(() => selectThreshold([NaN], [0.2])).toThrow();
});
it("keeps calibration queries separate from final evaluation", () => {
  expect(calibrationQuestions).toHaveLength(20);
  const heldOut = new Set<string>(pilotQuestions.map(q => q.query));
  expect(calibrationQuestions.every(q => !heldOut.has(q.query))).toBe(true);
  expect(calibrationQuestions.filter(q => q.requiredKey === null)).toHaveLength(5);
});
