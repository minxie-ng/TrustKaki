import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { AgentTrace } from "@/lib/types";
import { judgeRunSchema, recordedRouting } from "./judgeRunViewModel";
import AgentTracePanel from "./AgentTracePanel";

const trace: AgentTrace = { id: "trace", agentId: "orchestrator", agentName: "Jev Specialist Router", timestamp: "2026-10-17T00:00:00Z", input: "", reasoning: "", output: JSON.stringify({ mode: "active", requestedSpecialists: ["aac_nudge"], executedSpecialists: ["context_memory"], blockedSpecialists: ["aac_nudge"], independentOverrides: ["context_memory"] }), tags: [], modelUsed: "actual-provider-model", durationMs: 0, fallback: false };
describe("judge decision trail", () => {
  it("distinguishes requested, executed and independently triggered work", () => {
    expect(recordedRouting(trace)).toEqual({ mode: "Active routing", requested: "Community activities", executed: "Personal context", blocked: "Community activities", overrides: "Personal context" });
    expect(recordedRouting({ ...trace, output: "malformed" })).toBeNull();
  });
  it("does not claim RAG evidence or a saved result from historical traces", () => {
    const html = renderToStaticMarkup(createElement(AgentTracePanel, { traces: [trace], visible: true, onToggle: () => {} }));
    expect(html).toContain("Latest recorded traces");
    expect(html).not.toContain("Save outcome");
    expect(html).toContain("actual-provider-model");
    expect(html).toContain("0 ms");
  });
  it("shows retrieval outage, save failure and fallback truthfully", () => {
    const run = judgeRunSchema.parse({ messages: [], traces: [{ ...trace, fallback: true }], riskLevel: "yellow", retrieval: { status: "unavailable", items: [] }, persistence: { persisted: false } });
    const html = renderToStaticMarkup(createElement(AgentTracePanel, { traces: run.traces, run, visible: true, onToggle: () => {} }));
    expect(html).toContain("Retrieval unavailable");
    expect(html).toContain("Not saved");
    expect(html).toContain("Fallback used");
    expect(judgeRunSchema.safeParse({ messages: [{ text: "reply" }] }).success).toBe(false);
  });
});

it("shows bounded memory failure categories without provider details", () => {
  const run = judgeRunSchema.parse({ messages: [], traces: [], riskLevel: "yellow", persistence: { persisted: true,
    memory: { accepted: 0, rejected: 0, failed: 1, failures: [{ stage: "rpc", category: "conflict", message: "private provider detail" }] } } });
  const html = renderToStaticMarkup(createElement(AgentTracePanel, { traces: [], run, visible: true, onToggle: () => {} }));
  expect(html).toContain("Memory write conflict");
  expect(html).not.toContain("private provider detail");
  expect(JSON.stringify(run)).not.toContain("private provider detail");
});


it("preserves and displays a post-save pattern failure without claiming the chat failed", () => {
  const run = judgeRunSchema.parse({ messages: [{ text: "Could you tell me again?" }], traces: [], riskLevel: "red",
    persistence: { persisted: true, patternWatch: { status: "failed", detail: "private database detail" } } });
  const html = renderToStaticMarkup(createElement(AgentTracePanel, { traces: [], run, visible: true, onToggle: () => {} }));
  expect(html).toContain("Saved");
  expect(html).toContain("Pattern and care queue update failed");
  expect(html).not.toContain("private database detail");
});
