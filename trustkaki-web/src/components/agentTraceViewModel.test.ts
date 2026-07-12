import { describe, expect, it } from "vitest";
import {
  formatAgentOutputForCaregiver,
  formatStateChangeForCaregiver,
} from "./agentTraceViewModel";

describe("agent trace caregiver formatting", () => {
  it("uses the output summary when present", () => {
    expect(
      formatAgentOutputForCaregiver({
        outputSummary: "Follow-up suggested for appetite and knee pain.",
        output: '{"riskLevel":"yellow"}',
      })
    ).toBe("Follow-up suggested for appetite and knee pain.");
  });

  it("turns JSON output into readable text instead of raw braces", () => {
    const formatted = formatAgentOutputForCaregiver({
      output:
        '{"summary":"Knee pain and lower appetite were detected.","recommendedAction":"Call today.","signals":[{"description":"Knee pain"},{"description":"Skipped breakfast"}]}',
    });

    expect(formatted).toContain("Knee pain and lower appetite were detected.");
    expect(formatted).toContain("Call today.");
    expect(formatted).toContain("Knee pain");
    expect(formatted).not.toContain("{");
    expect(formatted).not.toContain("}");
  });

  it("formats technical state changes as short caregiver-readable phrases", () => {
    expect(formatStateChangeForCaregiver("risk:green->yellow")).toBe(
      "Risk changed from green to yellow"
    );
    expect(formatStateChangeForCaregiver("briefing:manual_override")).toBe(
      "Briefing requested by a human"
    );
  });
});
