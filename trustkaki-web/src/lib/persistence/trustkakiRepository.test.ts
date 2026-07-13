import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrateResponse,
} from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

const SENIOR_B = "00000000-0000-4000-8000-00000000000b";
const DEMO_SENIOR_ID = "00000000-0000-4000-8000-000000000001";

interface Operation {
  table: string;
  kind?: "delete" | "insert" | "select" | "update" | "upsert";
  columns?: string;
  payload?: unknown;
  filters: Array<[string, unknown]>;
}

function createServiceClient() {
  const operations: Operation[] = [];

  function responseFor(operation: Operation) {
    if (operation.kind === "select" && operation.table === "check_ins") {
      if (operation.columns === "id") {
        return { data: [{ id: "check-in-b" }], error: null };
      }
      return {
        data: { id: "check-in-b", senior_id: SENIOR_B, status: "active" },
        error: null,
      };
    }
    if (operation.table === "agent_runs" && operation.kind === "upsert") {
      return { data: [], error: null };
    }
    if (
      operation.kind === "select" &&
      [
        "detected_signals",
        "patterns",
        "routine_baselines",
        "senior_health_contexts",
        "senior_memories",
      ].includes(operation.table)
    ) {
      return { data: [], error: null };
    }
    return { data: null, error: null };
  }

  const from = vi.fn((table: string) => {
    const operation: Operation = { table, filters: [] };
    operations.push(operation);
    const builder = {
      delete: vi.fn(() => {
        operation.kind = "delete";
        return builder;
      }),
      insert: vi.fn((payload: unknown) => {
        operation.kind = "insert";
        operation.payload = payload;
        return builder;
      }),
      select: vi.fn((columns: string) => {
        if (!operation.kind) operation.kind = "select";
        operation.columns = columns;
        return builder;
      }),
      update: vi.fn((payload: unknown) => {
        operation.kind = "update";
        operation.payload = payload;
        return builder;
      }),
      upsert: vi.fn((payload: unknown) => {
        operation.kind = "upsert";
        operation.payload = payload;
        return builder;
      }),
      eq: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return builder;
      }),
      in: vi.fn((column: string, value: unknown) => {
        operation.filters.push([column, value]);
        return builder;
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => responseFor(operation)),
      single: vi.fn(async () => responseFor(operation)),
      then: (
        resolve: (value: ReturnType<typeof responseFor>) => unknown,
        reject: (reason: unknown) => unknown
      ) => Promise.resolve(responseFor(operation)).then(resolve, reject),
    };
    return builder;
  });

  return { client: { from }, operations };
}

const context: AgentRunContext = {
  senior: {
    name: "Senior B",
    age: 81,
    livingSituation: "Lives with family",
    caregiver: "Caregiver B",
    aacVolunteer: "Volunteer B",
  },
  messages: [
    {
      id: "message-b-1",
      sender: "senior",
      text: "Not hungry today.",
      timestamp: "2026-07-13T08:00:00.000Z",
    },
  ],
  currentRiskLevel: "green",
};

const briefing: BriefingOutput = {
  forCaregiver: "Please check appetite today.",
  forAACVolunteer: "Offer a gentle check-in.",
  overallRisk: "yellow",
  keyConcerns: ["Appetite"],
  recommendedActions: ["Call today"],
};

const orchestrationResult: OrchestrateResponse = {
  messages: [{ text: "Have you had some water?", agentId: "triage" }],
  traces: [
    {
      id: "trace-policy-b",
      agentId: "policy",
      agentName: "Policy",
      timestamp: "2026-07-13T08:00:01.000Z",
      input: "{}",
      reasoning: "Appetite concern",
      output: "{}",
      tags: ["policy"],
      fallback: false,
    },
  ],
  alerts: [
    {
      type: "daily_living",
      message: "Appetite concern",
      severity: "medium",
      urgent: false,
    },
  ],
  riskLevel: "yellow",
  riskChange: "increase",
  signals: [
    { type: "daily_living", description: "Skipped meal", severity: "medium" },
  ],
  policy: {
    finalRisk: "yellow",
    riskChange: "increase",
    briefingRequired: true,
    alerts: [],
    reasoning: ["Appetite concern"],
  },
  briefing,
};

function payloadsFor(operations: Operation[], table: string): unknown[] {
  return operations
    .filter((operation) => operation.table === table && operation.payload !== undefined)
    .map((operation) => operation.payload);
}

describe("TrustKaki persistence senior identity", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiServiceClientMock.mockReset();
  });

  it("propagates a non-demo senior and explicit client message ID to every orchestration write", async () => {
    const service = createServiceClient();
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { persistOrchestrationResult } = await import("./trustkakiRepository");

    await persistOrchestrationResult({
      seniorId: SENIOR_B,
      message: "Not hungry today.",
      clientMessageId: "message-b-1",
      context,
      result: orchestrationResult,
    });

    expect(payloadsFor(service.operations, "messages")).toEqual(
      expect.arrayContaining([
        expect.arrayContaining([
          expect.objectContaining({
            senior_id: SENIOR_B,
            client_message_id: "message-b-1",
          }),
        ]),
      ])
    );
    expect(payloadsFor(service.operations, "risk_events")).toContainEqual(
      expect.objectContaining({ senior_id: SENIOR_B })
    );
    expect(payloadsFor(service.operations, "alerts")).toContainEqual(
      expect.arrayContaining([expect.objectContaining({ senior_id: SENIOR_B })])
    );
    expect(payloadsFor(service.operations, "briefs")).toContainEqual(
      expect.objectContaining({ senior_id: SENIOR_B })
    );
    expect(
      service.operations.find(
        (operation) => operation.table === "seniors" && operation.kind === "update"
      )?.filters
    ).toContainEqual(["id", SENIOR_B]);
    expect(
      service.operations.find(
        (operation) => operation.table === "check_ins" && operation.kind === "select"
      )?.filters
    ).toContainEqual(["senior_id", SENIOR_B]);
    expect(
      service.operations
        .filter((operation) =>
          [
            "check_ins",
            "patterns",
            "routine_baselines",
            "senior_health_contexts",
            "senior_memories",
          ].includes(operation.table)
        )
        .flatMap((operation) => operation.filters)
    ).not.toContainEqual(["senior_id", DEMO_SENIOR_ID]);
    expect(JSON.stringify(service.operations)).not.toContain(DEMO_SENIOR_ID);
    expect(service.operations.some((operation) => operation.table === "caregivers")).toBe(false);
    expect(
      service.operations.some((operation) => operation.table === "senior_caregivers")
    ).toBe(false);
  });

  it("persists a manual briefing for the explicit non-demo senior", async () => {
    const service = createServiceClient();
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { persistManualBriefingResult } = await import("./trustkakiRepository");
    const result: AgentRunResult<BriefingOutput> = {
      ...orchestrationResult.traces[0],
      agentId: "briefing",
      agentName: "Briefing Agent",
      traceId: "trace-briefing-b",
      data: briefing,
      durationMs: 1,
      modelUsed: "test-model",
      inputSummary: "Briefing input",
      outputSummary: "Briefing output",
      stateChanges: [],
      errorMessage: null,
      fallback: false,
    };

    await persistManualBriefingResult({ seniorId: SENIOR_B, context, result, briefing });

    expect(payloadsFor(service.operations, "briefs")).toContainEqual(
      expect.objectContaining({ senior_id: SENIOR_B })
    );
    expect(JSON.stringify(service.operations)).not.toContain(DEMO_SENIOR_ID);
  });
});
