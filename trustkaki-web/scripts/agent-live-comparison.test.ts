import { expect, it } from "vitest";
import { comparisonCases } from "./agent-live-comparison";
import { agentPersonalMemorySchema } from "@/lib/memory/agentContext";

it("prepares 18 balanced and eight targeted fictional cases with valid memory envelopes", () => {
  const cases = comparisonCases();
  expect(cases).toHaveLength(26);
  expect(new Set(cases.map(item => item.id)).size).toBe(26);
  for (const item of cases) {
    expect(item.context.senior.name).toBe("Fictional Senior");
    expect(item.context.messages.at(-1)?.text).toBe(item.message);
    if (item.context.personalMemory) expect(agentPersonalMemorySchema.safeParse(item.context.personalMemory).success).toBe(true);
  }
});
