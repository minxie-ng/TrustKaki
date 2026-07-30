import { describe, expect, it } from "vitest";
import { benchmarkCategories } from "./contracts";
import { benchmarkCases } from "./cases";

describe("benchmarkCases", () => {
  it("contains 42 unique fictional cases balanced across every category", () => {
    expect(benchmarkCases).toHaveLength(42);
    expect(new Set(benchmarkCases.map((item) => item.id)).size).toBe(42);

    for (const category of benchmarkCategories) {
      expect(benchmarkCases.filter((item) => item.category === category)).toHaveLength(7);
    }
  });

  it("requires triage in every case and marks at least six ambiguous inputs", () => {
    expect(
      benchmarkCases.every((item) => item.expected.requiredAgents.includes("triage"))
    ).toBe(true);
    expect(benchmarkCases.filter((item) => item.ambiguous).length).toBeGreaterThanOrEqual(6);
  });

  it("keeps durable context out of benign and protected-data cases", () => {
    const excluded = benchmarkCases.filter((item) =>
      ["benign", "protected_data"].includes(item.category)
    );

    expect(
      excluded.every(
        (item) =>
          !item.expected.durableContextAllowed &&
          item.expected.forbiddenAgents.includes("context_memory")
      )
    ).toBe(true);
  });

  it("contains synthetic examples without project credentials or plausible contacts", () => {
    const text = JSON.stringify(benchmarkCases);

    expect(text).not.toContain(["judge", "@"].join(""));
    expect(text).not.toContain(["TrustKaki", "Judge"].join("-"));
    expect(text).not.toMatch(/\+65\s*[689]\d{7}/i);
    expect(text).not.toContain("S1234567A");
    expect(text).not.toContain("4111 1111 1111 1111");
  });
});
