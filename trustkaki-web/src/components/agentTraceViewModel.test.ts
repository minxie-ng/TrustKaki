import { describe, expect, it } from "vitest";
import {
  formatAgentInputForCaregiver,
  formatAgentOutputForCaregiver,
  formatStateChangeForCaregiver,
} from "./agentTraceViewModel";

describe("agent trace caregiver formatting", () => {
  it("turns raw JSON agent input into a plain summary", () => {
    const formatted = formatAgentInputForCaregiver({
      input:
        '{"messages":[{"messageId":"quick_pattern_demo_day_1","signals":[{"description":"Knee pain while walking."}]}]}',
      inputSummary: '{"messages":[{"messageId":"quick_pattern_demo_day_1"}]}',
    });

    expect(formatted).toContain("Knee pain while walking.");
    expect(formatted).not.toContain("{");
    expect(formatted).not.toContain("quick_pattern_demo_day_1");
  });

  it("uses the output summary when present", () => {
    expect(
      formatAgentOutputForCaregiver({
        outputSummary: "Follow-up suggested for appetite and knee pain.",
        output: '{"riskLevel":"yellow"}',
      })
    ).toBe("Follow-up suggested for appetite and knee pain.");
  });

  it("ignores JSON-like output summaries and formats the structured output instead", () => {
    const formatted = formatAgentOutputForCaregiver({
      outputSummary:
        '{"messages":[{"signals":[{"description":"Knee pain while walking."}]}],"riskLevel":"yellow"}',
      output:
        '{"messages":[{"signals":[{"description":"Knee pain while walking."},{"description":"Skipped breakfast."}]}],"riskLevel":"yellow","humanFollowUp":true}',
    });

    expect(formatted).toContain("Risk level: yellow.");
    expect(formatted).toContain("Human follow-up suggested.");
    expect(formatted).toContain("Knee pain while walking.");
    expect(formatted).not.toContain("{");
    expect(formatted).not.toContain("}");
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

  it("does not show raw braces when neither summary nor output can be parsed", () => {
    const formatted = formatAgentOutputForCaregiver({
      output: '{"malformed":',
    });

    expect(formatted).toBe("Structured result recorded.");
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
