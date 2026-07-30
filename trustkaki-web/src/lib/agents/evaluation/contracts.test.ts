import { describe, expect, it } from "vitest";
import { validateBenchmarkCases, type BenchmarkCase } from "./contracts";

const validCase: BenchmarkCase = {
  id: "care_appetite_01",
  category: "care",
  message: "Not hungry today. I skipped breakfast.",
  ambiguous: false,
  expected: {
    requiredAgents: ["triage"],
    forbiddenAgents: ["digital_safety", "context_memory"],
    digitalSafetyRequired: false,
    durableContextAllowed: false,
    humanFollowUpExpected: true,
    allowedRisk: ["yellow", "red"],
  },
  policyFixture: {
    signals: [
      {
        type: "daily_living",
        category: "daily_living",
        description: "Skipped breakfast",
        severity: "medium",
      },
    ],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpRequired: true,
    currentRiskLevel: "green",
    digitalSafety: null,
  },
};

describe("validateBenchmarkCases", () => {
  it("accepts a unique fictional case set", () => {
    expect(validateBenchmarkCases([validCase])).toEqual([validCase]);
  });

  it("rejects duplicate case ids", () => {
    expect(() => validateBenchmarkCases([validCase, validCase])).toThrow(
      "Duplicate benchmark case id"
    );
  });

  it("requires triage for every case", () => {
    const invalid = {
      ...validCase,
      expected: { ...validCase.expected, requiredAgents: [] },
    };

    expect(() => validateBenchmarkCases([invalid])).toThrow("must require triage");
  });

  it("rejects specialists listed as both required and forbidden", () => {
    const invalid = {
      ...validCase,
      expected: {
        ...validCase.expected,
        requiredAgents: ["triage", "digital_safety"],
      },
    } as BenchmarkCase;

    expect(() => validateBenchmarkCases([invalid])).toThrow(
      "cannot both require and forbid digital_safety"
    );
  });
});
