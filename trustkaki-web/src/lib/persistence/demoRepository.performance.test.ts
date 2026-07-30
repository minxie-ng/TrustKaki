import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentRunContext,
  AgentRunResult,
  TriageTimelineOutput,
} from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const mocks = vi.hoisted(() => ({
  getClient: vi.fn(),
  getOrCreateActiveCheckIn: vi.fn(),
  upsertAgentRuns: vi.fn(),
  runPatternWatchForSenior: vi.fn(),
}));

vi.mock("./persistenceSupport", () => ({
  getClient: mocks.getClient,
  localDemoMeta: () => ({ mode: "local_demo", configured: false, persisted: false }),
  supabaseMeta: () => ({ mode: "supabase", configured: true, persisted: true }),
  throwIfError: (error: unknown) => {
    if (error) throw error;
  },
}));

vi.mock("./orchestrationRepository", () => ({
  getOrCreateActiveCheckIn: mocks.getOrCreateActiveCheckIn,
  upsertAgentRuns: mocks.upsertAgentRuns,
}));

vi.mock("./patternRepository", () => ({
  runPatternWatchForSenior: mocks.runPatternWatchForSenior,
}));

import { persistQuickDemoTimelineResult } from "./demoRepository";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function demoArgs(withSignal = false) {
  const timestamp = "2026-07-30T03:00:00.000Z";
  const context: AgentRunContext = {
    senior: {
      name: "Mr Tan Ah Hock",
      age: 76,
      livingSituation: "Lives alone",
      caregiver: "Rachel Tan",
      aacVolunteer: "Mei Ling",
    },
    messages: [],
    currentRiskLevel: "green",
  };
  const result: AgentRunResult<TriageTimelineOutput> = {
    agentId: "triage",
    agentName: "Triage Agent",
    traceId: "trace-1",
    timestamp,
    input: "[]",
    reasoning: "Deterministic fixture",
    output: "One signal",
    tags: ["demo"],
    data: {
      messages: [{
        messageId: "message-1",
        signals: withSignal ? [{
          type: "health",
          description: "Knee discomfort",
          severity: "medium",
        }] : [],
        riskLevel: "yellow",
        summary: "Knee discomfort",
        humanFollowUpRequired: true,
      }],
      overallRiskLevel: "yellow",
      summary: "Knee discomfort",
    },
    durationMs: 0,
    modelUsed: "deterministic-demo-fixture",
    fallback: false,
    inputSummary: "Demo input",
    outputSummary: "Demo output",
    stateChanges: [],
  };
  return {
    seniorId: "00000000-0000-4000-8000-000000000001",
    messages: [{ id: "message-1", text: "Knee pain today.", timestamp }],
    context,
    result,
  };
}

function clientWithResponse(args: {
  started: string[];
  deferredTable?: string;
  deferredResponse?: Promise<{ error: null }>;
}) {
  class QueryBuilder {
    constructor(private table: string) {}
    upsert() { return this; }
    insert() { return this; }
    update() { return this; }
    eq() { return this; }
    then<TResult1 = unknown, TResult2 = never>(
      onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      args.started.push(this.table);
      const response = this.table === args.deferredTable && args.deferredResponse
        ? args.deferredResponse
        : Promise.resolve({ error: null });
      return response.then(onfulfilled, onrejected);
    }
  }
  return { from: (table: string) => new QueryBuilder(table) };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getOrCreateActiveCheckIn.mockResolvedValue({ id: "check-in-1" });
  mocks.upsertAgentRuns.mockResolvedValue([{ id: "run-1", agent_id: "triage" }]);
  mocks.runPatternWatchForSenior.mockResolvedValue(undefined);
});

describe("quick demo persistence latency", () => {
  it("starts senior and caregiver setup concurrently", async () => {
    const started: string[] = [];
    const seniorWrite = deferred<{ error: null }>();
    mocks.getClient.mockReturnValue(clientWithResponse({
      started,
      deferredTable: "seniors",
      deferredResponse: seniorWrite.promise,
    }));

    const persistence = persistQuickDemoTimelineResult(demoArgs());
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
    const caregiversStartedBeforeSeniorFinished = started.includes("caregivers");

    seniorWrite.resolve({ error: null });
    await persistence;

    expect(caregiversStartedBeforeSeniorFinished).toBe(true);
  });

  it("starts agent persistence while messages are being saved", async () => {
    const started: string[] = [];
    const messageWrite = deferred<{ error: null }>();
    mocks.getClient.mockReturnValue(clientWithResponse({
      started,
      deferredTable: "messages",
      deferredResponse: messageWrite.promise,
    }));

    const persistence = persistQuickDemoTimelineResult(demoArgs());
    for (let index = 0; index < 10; index += 1) await Promise.resolve();
    const agentWriteStartedBeforeMessagesFinished =
      mocks.upsertAgentRuns.mock.calls.length > 0;

    messageWrite.resolve({ error: null });
    await persistence;

    expect(agentWriteStartedBeforeMessagesFinished).toBe(true);
  });

  it("updates the check-in and senior while detected signals are being saved", async () => {
    const started: string[] = [];
    const signalWrite = deferred<{ error: null }>();
    mocks.getClient.mockReturnValue(clientWithResponse({
      started,
      deferredTable: "detected_signals",
      deferredResponse: signalWrite.promise,
    }));

    const persistence = persistQuickDemoTimelineResult(demoArgs(true));
    for (let index = 0; index < 15; index += 1) await Promise.resolve();
    const independentUpdatesStarted =
      started.includes("check_ins") &&
      started.filter((table) => table === "seniors").length >= 2;

    signalWrite.resolve({ error: null });
    await persistence;

    expect(independentUpdatesStarted).toBe(true);
  });
});
