import { describe, expect, it } from "vitest";
import type { AgentRunContext } from "./contracts";
import { orchestratorUserPrompt } from "./prompts";

describe("agent prompts", () => {
  it("represents the bounded null-age sentinel as unknown", () => {
    const context: AgentRunContext = {
      senior: {
        name: "Senior B",
        age: 0,
        livingSituation: "Not recorded",
        caregiver: "Caregiver B",
        aacVolunteer: "Not assigned",
      },
      messages: [],
      currentRiskLevel: "green",
    };

    const prompt = orchestratorUserPrompt("Hello", context);

    expect(prompt).toContain("- Age: unknown");
    expect(prompt).not.toContain("- Age: 0");
  });
});
