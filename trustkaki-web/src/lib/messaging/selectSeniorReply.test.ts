import { describe, expect, it } from "vitest";
import type { OrchestrateResponse } from "@/lib/agents/contracts";
import { selectSeniorReply } from "./selectSeniorReply";

function response(
  messages: OrchestrateResponse["messages"]
): OrchestrateResponse {
  return {
    messages,
    traces: [],
    alerts: [],
    riskLevel: "green",
    riskChange: "none",
    signals: [],
    policy: {
      finalRisk: "green",
      riskChange: "none",
      briefingRequired: false,
      alerts: [],
      reasoning: [],
    },
    briefing: null,
  };
}

describe("senior reply selection", () => {
  it("prioritises Digital Safety over Triage and other agent messages", () => {
    expect(
      selectSeniorReply(
        response([
          { text: "AAC reply", agentId: "aac_nudge" },
          { text: "Triage reply", agentId: "triage" },
          { text: "Pause and verify first", agentId: "digital_safety" },
        ])
      )
    ).toEqual({
      text: "Pause and verify first",
      agentId: "digital_safety",
      index: 2,
    });
  });

  it("uses Triage when Digital Safety did not run", () => {
    expect(
      selectSeniorReply(
        response([
          { text: "AAC reply", agentId: "aac_nudge" },
          { text: "Triage reply", agentId: "triage" },
        ])
      )
    ).toEqual({ text: "Triage reply", agentId: "triage", index: 1 });
  });

  it("falls back to the first message and returns null for no messages", () => {
    expect(
      selectSeniorReply(response([{ text: "First safe reply", agentId: "briefing" }]))
    ).toEqual({ text: "First safe reply", agentId: "briefing", index: 0 });
    expect(selectSeniorReply(response([]))).toBeNull();
  });
});
