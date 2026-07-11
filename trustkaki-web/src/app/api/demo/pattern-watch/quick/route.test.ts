import { beforeEach, describe, expect, it, vi } from "vitest";

const runTriageTimelineAgentMock = vi.fn();
const persistQuickDemoTimelineResultMock = vi.fn();
const readDashboardStateMock = vi.fn();
const resetDemoPersistenceMock = vi.fn();

vi.mock("@/lib/agents/orchestrator", () => ({
  runTriageTimelineAgent: runTriageTimelineAgentMock,
}));

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  persistQuickDemoTimelineResult: persistQuickDemoTimelineResultMock,
  readDashboardState: readDashboardStateMock,
  resetDemoPersistence: resetDemoPersistenceMock,
}));

function timelineResult(signalCount: number) {
  return {
    agentId: "triage",
    agentName: "Triage Agent",
    traceId: `trace-${Math.random()}`,
    timestamp: "2026-07-11T00:00:00.000Z",
    input: "input",
    reasoning: "structured output",
    output: "output",
    tags: [],
    durationMs: 10,
    modelUsed: "test-model",
    fallback: false,
    inputSummary: "Senior message",
    outputSummary: "Signals extracted",
    stateChanges: [],
    data: {
      messages: [
        {
          messageId: "quick_pattern_demo_day_1",
          signals: Array.from({ length: signalCount }, (_, index) => ({
            type: index % 2 === 0 ? "health" : "daily_living",
            description: `Signal ${index + 1}`,
            severity: "medium",
          })),
          riskLevel: "yellow",
          summary: "summary",
          humanFollowUpRequired: true,
        },
      ],
      overallRiskLevel: "yellow",
      summary: "timeline summary",
    },
  };
}

describe("/api/demo/pattern-watch/quick", () => {
  beforeEach(() => {
    vi.resetModules();
    runTriageTimelineAgentMock.mockReset();
    persistQuickDemoTimelineResultMock.mockReset();
    readDashboardStateMock.mockReset();
    resetDemoPersistenceMock.mockReset();

    resetDemoPersistenceMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    persistQuickDemoTimelineResultMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    readDashboardStateMock.mockResolvedValue({
      persistence: { mode: "supabase", configured: true, persisted: true },
      data: {
        followUpQueue: [],
      },
    });
  });

  it("does not hardcode a final pattern or queue result", async () => {
    runTriageTimelineAgentMock.mockResolvedValue(timelineResult(0));
    const { POST } = await import("./route");

    const response = await POST();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.signalsDetected).toBe(0);
    expect(json.queueCount).toBe(0);
    expect(persistQuickDemoTimelineResultMock).toHaveBeenCalledTimes(1);
  });

  it("uses one timeline extraction call for faster quick demo timing", async () => {
    runTriageTimelineAgentMock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(timelineResult(1)), 40))
    );
    const { POST } = await import("./route");

    const startedAt = Date.now();
    const response = await POST();
    const elapsed = Date.now() - startedAt;

    expect(response.status).toBe(200);
    expect(runTriageTimelineAgentMock).toHaveBeenCalledTimes(1);
    expect(elapsed).toBeLessThan(100);
  });
});
