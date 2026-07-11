import { describe, expect, it } from "vitest";
import { evaluatePatternWatch, type PatternSignal } from "./patternWatch";

function signal(
  id: string,
  type: PatternSignal["type"],
  description: string,
  observedAt: string,
  severity: PatternSignal["severity"] = "medium"
): PatternSignal {
  return { id, type, description, observedAt, severity };
}

describe("evaluatePatternWatch", () => {
  it("does not create a multi-signal pattern from one signal", () => {
    const result = evaluatePatternWatch([
      signal("s1", "health", "Knee pain today", "2026-07-07T08:00:00.000Z"),
    ]);

    expect(result).toEqual([]);
  });

  it("creates an active mobility pattern across different days", () => {
    const result = evaluatePatternWatch([
      signal("s1", "health", "Knee pain today", "2026-07-07T08:00:00.000Z"),
      signal("s2", "daily_living", "Avoids going downstairs", "2026-07-09T08:00:00.000Z"),
    ]);

    expect(result).toEqual([
      expect.objectContaining({
        patternType: "mobility_and_frailty",
        status: "active",
        contributingSignalIds: ["s1", "s2"],
      }),
    ]);
  });

  it("creates combined wellbeing decline only from appetite, mobility, and withdrawal/non-response", () => {
    const result = evaluatePatternWatch([
      signal("s1", "health", "Knee pain today", "2026-07-07T08:00:00.000Z"),
      signal("s2", "daily_living", "Skipped breakfast and not hungry", "2026-07-08T08:00:00.000Z"),
      signal("s3", "daily_living", "Avoids going downstairs", "2026-07-09T08:00:00.000Z"),
      signal("s4", "social", "Paiseh about lunch", "2026-07-10T08:00:00.000Z"),
      signal("s5", "social", "Missed usual check-in", "2026-07-11T08:00:00.000Z"),
    ]);

    expect(result.some((pattern) => pattern.patternType === "combined_wellbeing_decline")).toBe(true);
  });

  it("does not over-alert for unknown or normal variation", () => {
    const result = evaluatePatternWatch([
      signal("s1", "social", "Enjoyed short chat with volunteer", "2026-07-07T08:00:00.000Z", "low"),
      signal("s2", "daily_living", "Had breakfast later than usual", "2026-07-08T08:00:00.000Z", "low"),
    ]);

    expect(result).toEqual([]);
  });

  it("uses deterministic ordering for generated pattern candidates", () => {
    const result = evaluatePatternWatch([
      signal("s1", "health", "Knee pain today", "2026-07-07T08:00:00.000Z"),
      signal("s2", "daily_living", "Skipped breakfast and not hungry", "2026-07-08T08:00:00.000Z"),
      signal("s3", "daily_living", "Avoids going downstairs", "2026-07-09T08:00:00.000Z"),
      signal("s4", "social", "Paiseh about lunch", "2026-07-10T08:00:00.000Z"),
      signal("s5", "social", "Missed usual check-in", "2026-07-11T08:00:00.000Z"),
    ]);

    expect(result.map((pattern) => pattern.patternType)).toEqual([
      "mobility_and_frailty",
      "social_withdrawal",
      "combined_wellbeing_decline",
    ]);
  });
});
