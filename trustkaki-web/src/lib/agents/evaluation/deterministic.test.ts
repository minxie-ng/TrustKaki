import { describe, expect, it } from "vitest";
import { benchmarkCases } from "./cases";
import { evaluateDeterministicCase } from "./deterministic";

describe("evaluateDeterministicCase", () => {
  it("opens the durable-context gate only for a durable preference", () => {
    const durable = benchmarkCases.find((item) => item.category === "durable_context")!;
    const protectedData = benchmarkCases.find(
      (item) => item.category === "protected_data"
    )!;

    expect(evaluateDeterministicCase(durable).durableContextProposed).toBe(true);
    expect(evaluateDeterministicCase(protectedData).durableContextProposed).toBe(false);
  });

  it("uses deterministic policy for final risk and human follow-up", () => {
    const mobility = benchmarkCases.find((item) => item.id === "care_02")!;

    expect(evaluateDeterministicCase(mobility)).toMatchObject({
      mode: "deterministic",
      routingMeasured: false,
      selectedAgents: ["triage"],
      finalRisk: "yellow",
      humanFollowUpActual: true,
      schemaValid: true,
      fallback: false,
      errorCategory: null,
    });
  });
});
