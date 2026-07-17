import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentRunContext,
  AgentRunResult,
  BriefingOutput,
  OrchestrationResult,
} from "@/lib/agents/contracts";

vi.mock("server-only", () => ({}));

const createTrustKakiServiceClientMock = vi.fn();
const runPatternWatchForSeniorMock = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createTrustKakiServiceClient: createTrustKakiServiceClientMock,
}));

vi.mock("./patternRepository", () => ({
  runPatternWatchForSenior: runPatternWatchForSeniorMock,
}));

const SENIOR_B = "00000000-0000-4000-8000-00000000000b";
const DEMO_SENIOR_ID = "00000000-0000-4000-8000-000000000001";

interface Operation {
  table: string;
  kind?: "delete" | "insert" | "select" | "update" | "upsert";
  columns?: string;
  payload?: unknown;
  options?: Record<string, unknown>;
  filters: Array<[string, unknown]>;
  orFilters?: string[];
}

function createServiceClient(
  messageMetadata: Record<string, unknown> = {},
  options: {
    inboundInserted?: boolean;
    inboundInsertedSequence?: boolean[];
    enforceBinding?: boolean;
    failRiskEventOnce?: boolean;
    rpcError?: { code: string; message: string };
  } = {}
) {
  const operations: Operation[] = [];
  const storedKeys = new Map<string, Set<string>>();
  let inboundAttempt = 0;
  let riskEventFailed = false;
  const bindings = new Map<string, string>();
  const bindingCommandsByClientMessage = new Map<string, string>();
  const rpc = vi.fn().mockImplementation(async (name: string, args: Record<string, unknown>) => {
    if (name === "bind_orchestration_persistence") {
      if (!options.enforceBinding) return { data: { duplicate: false }, error: null };
      const commandId = String(args.p_command_id);
      const clientMessageId = String(args.p_client_message_id);
      const payload = JSON.stringify(args.p_payload_json);
      const existing = bindings.get(commandId);
      const existingClientCommand = bindingCommandsByClientMessage.get(clientMessageId);
      if (
        (existing !== undefined && existing !== payload) ||
        (existingClientCommand !== undefined && existingClientCommand !== commandId)
      ) {
        return {
          data: null,
          error: { code: "PT409", message: "Persistence replay payload conflict" },
        };
      }
      bindings.set(commandId, payload);
      bindingCommandsByClientMessage.set(clientMessageId, commandId);
      return { data: { duplicate: existing !== undefined }, error: null };
    }
    return (
    options.rpcError
      ? { data: null, error: options.rpcError }
      : {
          data: {
            accepted: true,
            store: "memory",
            context_id: "00000000-0000-4000-8000-000000000301",
            event: "proposal_accepted",
            duplicate: options.inboundInserted === false,
          },
          error: null,
        }
    );
  });

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
      rememberRows(operation);
      return { data: [], error: null };
    }
    if (
      operation.table === "messages" &&
      operation.kind === "upsert" &&
      operation.columns === "id, created_at"
    ) {
      return {
        data:
          (options.inboundInsertedSequence?.[inboundAttempt++] ??
            options.inboundInserted ?? true) === false
            ? null
            : {
                id: "00000000-0000-4000-8000-000000000302",
                created_at: "2026-07-16T08:00:00.000Z",
              },
        error: null,
      };
    }
    if (
      operation.kind === "upsert" &&
      ["messages", "detected_signals", "risk_events", "alerts", "briefs"].includes(
        operation.table
      )
    ) {
      if (
        operation.table === "risk_events" &&
        options.failRiskEventOnce &&
        !riskEventFailed
      ) {
        riskEventFailed = true;
        return { data: null, error: { message: "injected risk event failure" } };
      }
      rememberRows(operation);
    }
    if (
      operation.table === "messages" &&
      operation.kind === "select" &&
      operation.columns === "id, created_at"
    ) {
      return {
        data: {
          id: "00000000-0000-4000-8000-000000000302",
          created_at: "2026-07-16T08:00:00.000Z",
        },
        error: null,
      };
    }
    if (
      operation.table === "messages" &&
      operation.kind === "select" &&
      operation.columns === "id, external_metadata"
    ) {
      return {
        data: { id: "message-outbound", external_metadata: messageMetadata },
        error: null,
      };
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

  function rememberRows(operation: Operation) {
    const rows = Array.isArray(operation.payload)
      ? operation.payload
      : [operation.payload];
    const keys = storedKeys.get(operation.table) ?? new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object") continue;
      const value = row as Record<string, unknown>;
      const key = value.id ?? value.trace_id ?? value.client_message_id;
      if (typeof key === "string") keys.add(key);
    }
    storedKeys.set(operation.table, keys);
  }

  const from = vi.fn((table: string) => {
    const operation: Operation = { table, filters: [], orFilters: [] };
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
      upsert: vi.fn((payload: unknown, upsertOptions?: Record<string, unknown>) => {
        operation.kind = "upsert";
        operation.payload = payload;
        operation.options = upsertOptions;
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
      or: vi.fn((filter: string) => {
        operation.orFilters?.push(filter);
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

  return { client: { from, rpc }, operations, rpc, storedKeys };
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

const orchestrationResult = {
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
} as unknown as OrchestrationResult;
Object.defineProperty(orchestrationResult, "contextMemoryCandidates", {
  configurable: true,
  value: [],
  enumerable: false,
});

function payloadsFor(operations: Operation[], table: string): unknown[] {
  return operations
    .filter((operation) => operation.table === table && operation.payload !== undefined)
    .map((operation) => operation.payload);
}

describe("TrustKaki persistence senior identity", () => {
  beforeEach(() => {
    vi.resetModules();
    createTrustKakiServiceClientMock.mockReset();
    runPatternWatchForSeniorMock.mockReset();
    runPatternWatchForSeniorMock.mockResolvedValue(undefined);
  });

  it("excludes expired and archived context from Pattern Watch evidence", async () => {
    const operations: Operation[] = [];
    const contextRows = {
      routine_baselines: [],
      senior_health_contexts: [],
      senior_memories: [
        {
          id: "active-memory",
          memory_type: "communication_preference",
          content: "Prefers Mei Ling to call",
          status: "active",
          expires_at: null,
        },
        {
          id: "expired-memory",
          memory_type: "food_preference",
          content: "Expired preference",
          status: "active",
          expires_at: "2000-01-01T00:00:00.000Z",
        },
        {
          id: "archived-memory",
          memory_type: "food_preference",
          content: "Archived preference",
          status: "archived",
          expires_at: null,
        },
      ],
    };
    const from = vi.fn((table: string) => {
      const operation: Operation = { table, filters: [], orFilters: [] };
      operations.push(operation);
      const response = () => {
        if (table === "check_ins") {
          return { data: [{ id: "check-in-b" }], error: null };
        }
        if (table === "detected_signals") {
          return {
            data: [
              {
                id: "signal-1",
                signal_type: "health",
                description: "Knee pain while walking",
                severity: "medium",
                observed_at: "2026-07-15T08:00:00.000Z",
              },
              {
                id: "signal-2",
                signal_type: "health",
                description: "Staying home due to knee pain",
                severity: "medium",
                observed_at: "2026-07-16T08:00:00.000Z",
              },
            ],
            error: null,
          };
        }
        if (table in contextRows) {
          const rows = contextRows[table as keyof typeof contextRows];
          const activeOnly = operation.filters.some(
            ([column, value]) => column === "status" && value === "active"
          );
          const filtersExpiry = operation.orFilters?.some((filter) =>
            filter.startsWith("expires_at.is.null,expires_at.gt.")
          );
          return {
            data: rows.filter(
              (row) =>
                (!activeOnly || row.status === "active") &&
                (!filtersExpiry ||
                  row.expires_at === null ||
                  row.expires_at > "2090-01-01T00:00:00.000Z")
            ),
            error: null,
          };
        }
        if (table === "patterns" && operation.kind === "select") {
          return { data: operation.filters.some(([column]) => column === "pattern_type") ? null : [], error: null };
        }
        if (table === "patterns" && operation.kind === "insert") {
          return { data: { id: "pattern-1", ...(operation.payload as object) }, error: null };
        }
        return { data: [], error: null };
      };
      const builder = {
        select: vi.fn((columns: string) => {
          if (!operation.kind) operation.kind = "select";
          operation.columns = columns;
          return builder;
        }),
        insert: vi.fn((payload: unknown) => {
          operation.kind = "insert";
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
        or: vi.fn((filter: string) => {
          operation.orFilters?.push(filter);
          return builder;
        }),
        order: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => response()),
        single: vi.fn(async () => response()),
        then: (
          resolve: (value: ReturnType<typeof response>) => unknown,
          reject: (reason: unknown) => unknown
        ) => Promise.resolve(response()).then(resolve, reject),
      };
      return builder;
    });
    const actual = await vi.importActual<typeof import("./patternRepository")>(
      "./patternRepository"
    );

    await actual.runPatternWatchForSenior({ from } as never, SENIOR_B);

    const patternPayload = operations.find(
      (operation) => operation.table === "patterns" && operation.kind === "insert"
    )?.payload as { memory_notes?: string[] };
    expect(patternPayload.memory_notes).toEqual(["Prefers Mei Ling to call"]);
    for (const table of Object.keys(contextRows)) {
      const query = operations.find((operation) => operation.table === table);
      expect(query?.filters).toContainEqual(["status", "active"]);
      expect(query?.orFilters?.[0]).toMatch(
        /^expires_at\.is\.null,expires_at\.gt\./
      );
    }
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

  it("uses the persisted inbound UUID for memory and isolates an RPC failure", async () => {
    const service = createServiceClient({}, {
      rpcError: { code: "PT409", message: "Context changed" },
    });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { persistOrchestrationResult } = await import("./trustkakiRepository");
    const resultWithMemory = orchestrationResult;
    Object.defineProperty(resultWithMemory, "contextMemoryCandidates", {
      configurable: true,
      value: [{
        targetStore: "memory",
        contextKey: "meal_preference",
        contextType: "food_preference",
        content: "Prefers porridge for breakfast",
        sourceMessageId: "message-b-1",
        evidenceExcerpt: "Not hungry today.",
        confidence: 0.93,
        applicationTags: ["practical_meal_prompt"],
        retentionClass: "preference",
      }],
      enumerable: false,
    });

    const persistence = await persistOrchestrationResult({
      seniorId: SENIOR_B,
      message: "Not hungry today.",
      clientMessageId: "message-b-1",
      context,
      result: resultWithMemory,
    });

    expect(service.rpc).toHaveBeenCalledWith(
      "apply_automatic_senior_context",
      expect.objectContaining({
        p_source_message_id: "00000000-0000-4000-8000-000000000302",
      })
    );
    expect(persistence).toMatchObject({
      persisted: true,
      memory: {
        attempted: 1,
        failed: 1,
        failures: [{ stage: "rpc", category: "conflict" }],
      },
    });
    expect(payloadsFor(service.operations, "alerts")).not.toEqual([]);
    expect(payloadsFor(service.operations, "briefs")).not.toEqual([]);
  });

  it("rejects ambiguous candidate keys before any RPC or table write", async () => {
    const service = createServiceClient();
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { persistOrchestrationResult } = await import("./trustkakiRepository");
    const resultWithDuplicates = orchestrationResult;
    Object.defineProperty(resultWithDuplicates, "contextMemoryCandidates", {
      configurable: true,
      value: [
        {
          targetStore: "memory",
          contextKey: "Meal Preference",
          contextType: "food_preference",
          content: "Prefers porridge for breakfast",
          sourceMessageId: "message-b-1",
          evidenceExcerpt: "Not hungry today.",
          confidence: 0.93,
          applicationTags: ["practical_meal_prompt"],
          retentionClass: "preference",
          intent: "confirm",
        },
        {
          targetStore: "memory",
          contextKey: "meal-preference",
          contextType: "food_preference",
          content: "Prefers rice for breakfast",
          sourceMessageId: "message-b-1",
          evidenceExcerpt: "Not hungry today.",
          confidence: 0.91,
          applicationTags: ["practical_meal_prompt"],
          retentionClass: "preference",
          intent: "replace",
        },
      ],
      enumerable: false,
    });

    await expect(
      persistOrchestrationResult({
        seniorId: SENIOR_B,
        message: "Not hungry today.",
        clientMessageId: "message-b-1",
        context,
        result: resultWithDuplicates,
      })
    ).rejects.toThrow("ambiguous context candidate key");

    expect(service.rpc).not.toHaveBeenCalled();
    expect(service.operations).toEqual([]);
  });

  it("binds the complete private payload before writes and rejects changed replay input", async () => {
    const service = createServiceClient({}, {
      inboundInsertedSequence: [true, false],
      enforceBinding: true,
    });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { persistOrchestrationResult } = await import("./trustkakiRepository");
    const result = orchestrationResult;
    Object.defineProperty(result, "contextMemoryCandidates", {
      configurable: true,
      value: [{
        targetStore: "memory",
        contextKey: "meal_preference",
        contextType: "food_preference",
        content: "Prefers porridge for breakfast",
        sourceMessageId: "message-b-1",
        evidenceExcerpt: "Not hungry today.",
        confidence: 0.93,
        applicationTags: ["practical_meal_prompt"],
        retentionClass: "preference",
      }],
      enumerable: false,
    });
    const request = {
      seniorId: SENIOR_B,
      message: "Not hungry today.",
      clientMessageId: "message-b-1",
      context,
      result,
    };

    await persistOrchestrationResult(request);
    expect(service.rpc.mock.invocationCallOrder[0]).toBeLessThan(
      service.client.from.mock.invocationCallOrder[0]
    );
    await expect(persistOrchestrationResult(request)).resolves.toMatchObject({
      persisted: true,
      replayed: true,
    });
    const operationsBeforeConflict = service.operations.length;
    const changedResult = { ...result } as typeof result;
    Object.defineProperty(changedResult, "contextMemoryCandidates", {
      value: [{
        ...result.contextMemoryCandidates[0],
        content: "Prefers rice for breakfast",
      }],
      enumerable: false,
    });

    const changedPublicResult = {
      ...result,
      messages: [{ ...result.messages[0], text: "A changed reply" }],
    } as typeof result;
    Object.defineProperty(changedPublicResult, "contextMemoryCandidates", {
      value: result.contextMemoryCandidates,
      enumerable: false,
    });
    for (const changedRequest of [
      { ...request, message: "Changed inbound text." },
      { ...request, result: changedPublicResult },
      { ...request, result: changedResult },
      { ...request, seniorId: "00000000-0000-4000-8000-00000000000c" },
    ]) {
      await expect(persistOrchestrationResult(changedRequest)).rejects.toThrow(
        "Persistence replay payload conflict"
      );
    }

    expect(service.operations).toHaveLength(operationsBeforeConflict);
    expect(service.rpc.mock.calls[0]?.[0]).toBe("bind_orchestration_persistence");
    expect(
      service.rpc.mock.calls.filter(([name]) => name === "apply_automatic_senior_context")
    ).toHaveLength(2);
  });

  it("resumes a replay after a downstream failure and completes each artifact once", async () => {
    const service = createServiceClient({}, {
      inboundInsertedSequence: [true, false],
      failRiskEventOnce: true,
    });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { persistOrchestrationResult } = await import("./trustkakiRepository");
    const resultWithMemory = orchestrationResult;
    Object.defineProperty(resultWithMemory, "contextMemoryCandidates", {
      configurable: true,
      value: [{
        targetStore: "memory",
        contextKey: "meal_preference",
        contextType: "food_preference",
        content: "Prefers porridge for breakfast",
        sourceMessageId: "message-b-1",
        evidenceExcerpt: "Not hungry today.",
        confidence: 0.93,
        applicationTags: ["practical_meal_prompt"],
        retentionClass: "preference",
      }],
      enumerable: false,
    });

    const request = {
      seniorId: SENIOR_B,
      message: "Not hungry today.",
      clientMessageId: "message-b-1",
      context,
      result: resultWithMemory,
    };

    await expect(persistOrchestrationResult(request)).rejects.toThrow(
      "injected risk event failure"
    );
    expect(service.storedKeys.get("detected_signals")?.size).toBe(1);
    expect(service.storedKeys.get("risk_events")).toBeUndefined();
    expect(service.storedKeys.get("alerts")).toBeUndefined();
    expect(service.storedKeys.get("briefs")).toBeUndefined();

    const persistence = await persistOrchestrationResult(request);

    expect(persistence).toMatchObject({
      persisted: true,
      replayed: true,
      memory: { attempted: 1, failed: 0 },
    });
    expect(
      service.rpc.mock.calls.filter(([name]) => name === "apply_automatic_senior_context")
    ).toHaveLength(2);
    expect(runPatternWatchForSeniorMock).toHaveBeenCalledTimes(1);
    expect(service.storedKeys.get("messages")?.size).toBe(1);
    expect(service.storedKeys.get("agent_runs")?.size).toBe(1);
    expect(service.storedKeys.get("detected_signals")?.size).toBe(1);
    expect(service.storedKeys.get("risk_events")?.size).toBe(1);
    expect(service.storedKeys.get("alerts")?.size).toBe(1);
    expect(service.storedKeys.get("briefs")?.size).toBe(1);
    for (const table of ["detected_signals", "risk_events", "alerts", "briefs"]) {
      expect(
        service.operations.filter(
          (operation) => operation.table === table && operation.kind === "insert"
        )
      ).toEqual([]);
    }
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

  it("records inbound WhatsApp provenance on the persisted conversation message", async () => {
    const service = createServiceClient();
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { recordInboundMessageMetadata } = await import("./trustkakiRepository");

    await recordInboundMessageMetadata({
      externalPlatform: "whatsapp",
      clientMessageId: "wamid.inbound",
      externalMessageId: "wamid.inbound",
      externalMetadata: { direction: "inbound", source: "webhook" },
    });

    const update = service.operations.find(
      (operation) => operation.table === "messages" && operation.kind === "update"
    );
    expect(update?.payload).toEqual({
      external_platform: "whatsapp",
      external_message_id: "wamid.inbound",
      external_metadata: { direction: "inbound", source: "webhook" },
    });
    expect(update?.filters).toContainEqual(["client_message_id", "wamid.inbound"]);
  });

  it("records Telegram provenance without labelling it as WhatsApp", async () => {
    const service = createServiceClient();
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const {
      recordInboundMessageMetadata,
      recordOutboundMessageMetadata,
    } = await import("./trustkakiRepository");

    await recordInboundMessageMetadata({
      externalPlatform: "telegram",
      clientMessageId: "telegram:910000001",
      externalMessageId: "73",
      externalMetadata: { direction: "inbound", source: "webhook" },
    });
    await recordOutboundMessageMetadata({
      externalPlatform: "telegram",
      clientMessageId: "out_trace_orchestrator_0",
      externalMessageId: "74",
      externalMetadata: { delivery_state: "provider_accepted" },
    });

    const updates = service.operations.filter(
      (operation) => operation.table === "messages" && operation.kind === "update"
    );
    expect(updates.map((operation) => operation.payload)).toEqual([
      expect.objectContaining({ external_platform: "telegram" }),
      expect.objectContaining({
        external_platform: "telegram",
        external_metadata: { delivery_state: "provider_accepted" },
      }),
    ]);
  });

  it("preserves outbound metadata while recording the newest delivery status", async () => {
    const service = createServiceClient({ selected_agent_id: "triage" });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { recordWhatsAppDeliveryStatus } = await import("./trustkakiRepository");

    await recordWhatsAppDeliveryStatus({
      externalMessageId: "wamid.outbound",
      status: "delivered",
      statusAt: "2026-07-14T09:05:54.000Z",
    });

    expect(payloadsFor(service.operations, "messages")).toContainEqual({
      external_metadata: {
        selected_agent_id: "triage",
        whatsapp_delivery: {
          status: "delivered",
          updated_at: "2026-07-14T09:05:54.000Z",
        },
      },
    });
  });

  it("does not let an older status overwrite newer delivery metadata", async () => {
    const service = createServiceClient({
      whatsapp_delivery: {
        status: "read",
        updated_at: "2026-07-14T09:06:00.000Z",
      },
    });
    createTrustKakiServiceClientMock.mockReturnValue(service.client);
    const { recordWhatsAppDeliveryStatus } = await import("./trustkakiRepository");

    await recordWhatsAppDeliveryStatus({
      externalMessageId: "wamid.outbound",
      status: "sent",
      statusAt: "2026-07-14T09:05:53.000Z",
    });

    expect(
      service.operations.some(
        (operation) => operation.table === "messages" && operation.kind === "update"
      )
    ).toBe(false);
  });
});
