import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunContext, OrchestrateResponse } from "@/lib/agents/contracts";
import type { Database, Json } from "@/lib/supabase/types";

vi.mock("server-only", () => ({}));

const orchestrateMock = vi.fn();
const loadSeniorContextByMessagingIdentityMock = vi.fn();
const persistOrchestrationResultMock = vi.fn();
const recordInboundMessageMetadataMock = vi.fn();
const recordOutboundMessageMetadataMock = vi.fn();
const acceptTelegramEventMock = vi.fn();
const claimTelegramEventMock = vi.fn();
const listRetryableTelegramEventsMock = vi.fn();
const storeTelegramOrchestrationResultMock = vi.fn();
const markTelegramOrchestrationCompletedMock = vi.fn();
const updateTelegramOutboundStateMock = vi.fn();
const markTelegramEventProcessedMock = vi.fn();
const markTelegramEventFailedMock = vi.fn();
const logTelegramErrorMock = vi.fn();

vi.mock("@/lib/agents/orchestrator", () => ({ orchestrate: orchestrateMock }));
vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  persistOrchestrationResult: persistOrchestrationResultMock,
  recordInboundMessageMetadata: recordInboundMessageMetadataMock,
  recordOutboundMessageMetadata: recordOutboundMessageMetadataMock,
}));
vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadSeniorContextByMessagingIdentity: loadSeniorContextByMessagingIdentityMock,
}));
vi.mock("@/lib/persistence/telegramEventRepository", () => ({
  acceptTelegramEvent: acceptTelegramEventMock,
  claimTelegramEvent: claimTelegramEventMock,
  listRetryableTelegramEvents: listRetryableTelegramEventsMock,
  storeTelegramOrchestrationResult: storeTelegramOrchestrationResultMock,
  markTelegramOrchestrationCompleted: markTelegramOrchestrationCompletedMock,
  updateTelegramOutboundState: updateTelegramOutboundStateMock,
  markTelegramEventProcessed: markTelegramEventProcessedMock,
  markTelegramEventFailed: markTelegramEventFailedMock,
}));
vi.mock("./logging", () => ({ logTelegramError: logTelegramErrorMock }));

type TelegramEventRow =
  Database["public"]["Tables"]["telegram_webhook_events"]["Row"];

const seniorId = "00000000-0000-4000-8000-00000000000b";
const context: AgentRunContext = {
  senior: {
    name: "Mr Tan Ah Hock",
    age: 78,
    livingSituation: "Lives alone",
    caregiver: "Rachel Tan",
    aacVolunteer: "Mei Ling",
  },
  messages: [],
  currentRiskLevel: "green",
};
const orchestrationResponse: OrchestrateResponse = {
  messages: [{ text: "Please eat something light and let Rachel know.", agentId: "triage" }],
  traces: [
    {
      id: "trace_orchestrator",
      agentId: "orchestrator",
      agentName: "Orchestrator Agent",
      timestamp: "2026-07-15T00:00:01.000Z",
      input: "input",
      reasoning: "route",
      output: "{}",
      tags: ["llm_success"],
      fallback: false,
    },
    {
      id: "trace_policy",
      agentId: "policy",
      agentName: "Policy",
      timestamp: "2026-07-15T00:00:02.000Z",
      input: "{}",
      reasoning: "policy",
      output: "{}",
      tags: ["policy"],
      fallback: false,
    },
  ],
  alerts: [],
  riskLevel: "yellow",
  riskChange: "increase",
  signals: [{ type: "health", description: "Knee pain", severity: "medium" }],
  policy: {
    finalRisk: "yellow",
    riskChange: "increase",
    briefingRequired: false,
    alerts: [],
    reasoning: ["Medium health signal"],
  },
  briefing: null,
};

function eventRow(overrides: Partial<TelegramEventRow> = {}): TelegramEventRow {
  return {
    id: "event-telegram-1",
    update_id: "910000001",
    event_type: "inbound_text",
    telegram_message_id: "73",
    sender_user_id: "8123456789",
    chat_id: "8123456789",
    text_body: "Not hungry today. Knee pain.",
    payload: {},
    status: "received",
    attempt_count: 0,
    last_error: null,
    processing_started_at: null,
    orchestration_result: null,
    orchestration_context: null,
    orchestration_completed_at: null,
    selected_reply_text: null,
    selected_reply_agent_id: null,
    selected_reply_client_message_id: null,
    outbound_status: "not_started",
    outbound_message_id: null,
    occurred_at: "2026-07-15T00:00:00.000Z",
    received_at: "2026-07-15T00:00:00.000Z",
    processed_at: null,
    created_at: "2026-07-15T00:00:00.000Z",
    updated_at: "2026-07-15T00:00:00.000Z",
    ...overrides,
  };
}

describe("Telegram orchestration service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSeniorContextByMessagingIdentityMock.mockResolvedValue({ seniorId, context });
    orchestrateMock.mockResolvedValue(orchestrationResponse);
    persistOrchestrationResultMock.mockResolvedValue({ persisted: true });
    recordInboundMessageMetadataMock.mockResolvedValue({ persisted: true });
    recordOutboundMessageMetadataMock.mockResolvedValue({ persisted: true });
    storeTelegramOrchestrationResultMock.mockResolvedValue(undefined);
    markTelegramOrchestrationCompletedMock.mockResolvedValue(undefined);
    updateTelegramOutboundStateMock.mockResolvedValue(undefined);
    markTelegramEventProcessedMock.mockResolvedValue(undefined);
    markTelegramEventFailedMock.mockResolvedValue(undefined);
  });

  it("accepts a parsed update through the durable inbox and reports duplicates", async () => {
    const { acceptTelegramWebhookEvent } = await import("./service");
    const payload = {
      update_id: 910000001,
      message: {
        message_id: 73,
        date: 1784102400,
        from: { id: 8123456789, is_bot: false },
        chat: { id: 8123456789, type: "private" },
        text: "Not hungry today. Knee pain.",
      },
    };
    acceptTelegramEventMock.mockResolvedValue({
      row: eventRow(),
      duplicate: true,
    });

    const result = await acceptTelegramWebhookEvent(payload);

    expect(result).toEqual({
      status: "duplicate",
      eventId: "event-telegram-1",
      duplicate: true,
    });
    expect(acceptTelegramEventMock).toHaveBeenCalledWith({
      updateId: "910000001",
      telegramMessageId: "73",
      senderUserId: "8123456789",
      chatId: "8123456789",
      occurredAt: new Date(1784102400 * 1000).toISOString(),
      text: "Not hungry today. Knee pain.",
      payload,
    });
  });

  it("ignores unsupported updates without writing an inbox event", async () => {
    const { acceptTelegramWebhookEvent } = await import("./service");

    await expect(
      acceptTelegramWebhookEvent({ update_id: 910000002, edited_message: {} })
    ).resolves.toEqual({ status: "ignored" });
    expect(acceptTelegramEventMock).not.toHaveBeenCalled();
  });

  it("runs the real orchestrator once and persists its policy-authoritative result", async () => {
    const { processTelegramEventById } = await import("./service");
    claimTelegramEventMock.mockResolvedValue(eventRow());
    const sendText = vi.fn().mockResolvedValue({ messageId: "74" });

    const result = await processTelegramEventById("event-telegram-1", {
      outboundClient: { sendText },
    });

    expect(result).toEqual({
      status: "processed",
      inboundMessageId: "73",
      outboundMessageId: "74",
    });
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(persistOrchestrationResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        seniorId,
        clientMessageId: "telegram:910000001",
        result: orchestrationResponse,
      })
    );
    expect(recordInboundMessageMetadataMock).toHaveBeenCalledWith({
      externalPlatform: "telegram",
      clientMessageId: "telegram:910000001",
      externalMessageId: "73",
      externalMetadata: {
        direction: "inbound",
        source: "webhook",
        update_id: "910000001",
      },
    });
    expect(sendText).toHaveBeenCalledWith({
      chatId: "8123456789",
      text: "Please eat something light and let Rachel know.",
    });
    expect(updateTelegramOutboundStateMock).toHaveBeenLastCalledWith({
      eventId: "event-telegram-1",
      outboundStatus: "accepted",
      outboundMessageId: "74",
    });
    expect(recordOutboundMessageMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        externalPlatform: "telegram",
        externalMessageId: "74",
        externalMetadata: expect.objectContaining({
          delivery_state: "provider_accepted",
        }),
      })
    );
    expect(JSON.stringify(recordOutboundMessageMetadataMock.mock.calls)).not.toContain(
      "delivered"
    );
    expect(JSON.stringify(recordOutboundMessageMetadataMock.mock.calls)).not.toContain(
      "read"
    );
  });

  it("does not process an unknown Telegram identity", async () => {
    const { processTelegramEventById } = await import("./service");
    claimTelegramEventMock.mockResolvedValue(eventRow());
    loadSeniorContextByMessagingIdentityMock.mockResolvedValue(null);
    const sendText = vi.fn();

    const result = await processTelegramEventById("event-telegram-1", {
      outboundClient: { sendText },
    });

    expect(result.status).toBe("senior_not_found");
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
    expect(markTelegramEventProcessedMock).toHaveBeenCalledWith("event-telegram-1");
  });

  it("does not rerun agents or persistence when retrying a stored send failure", async () => {
    const { processTelegramEventById } = await import("./service");
    claimTelegramEventMock.mockResolvedValue(
      eventRow({
        status: "failed",
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: context as unknown as Json,
        orchestration_completed_at: "2026-07-15T00:00:05.000Z",
        selected_reply_text: orchestrationResponse.messages[0].text,
        selected_reply_agent_id: "triage",
        selected_reply_client_message_id: "out_trace_orchestrator_0",
        outbound_status: "failed",
      })
    );
    const sendText = vi.fn().mockResolvedValue({ messageId: "75" });

    const result = await processTelegramEventById("event-telegram-1", {
      outboundClient: { sendText },
    });

    expect(result.status).toBe("processed");
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("preserves provider acceptance and does not resend after metadata failure", async () => {
    const { processTelegramEventById } = await import("./service");
    claimTelegramEventMock
      .mockResolvedValueOnce(eventRow())
      .mockResolvedValueOnce(
        eventRow({
          status: "failed",
          orchestration_result: orchestrationResponse as unknown as Json,
          orchestration_context: context as unknown as Json,
          orchestration_completed_at: "2026-07-15T00:00:05.000Z",
          selected_reply_text: orchestrationResponse.messages[0].text,
          selected_reply_agent_id: "triage",
          selected_reply_client_message_id: "out_trace_orchestrator_0",
          outbound_status: "accepted",
          outbound_message_id: "74",
        })
      );
    const sendText = vi.fn().mockResolvedValue({ messageId: "74" });
    recordOutboundMessageMetadataMock.mockRejectedValueOnce(
      new Error("metadata unavailable")
    );

    const failed = await processTelegramEventById("event-telegram-1", {
      outboundClient: { sendText },
    });
    const recovered = await processTelegramEventById("event-telegram-1", {
      outboundClient: { sendText },
    });

    expect(failed.status).toBe("error");
    expect(recovered).toMatchObject({
      status: "processed",
      outboundMessageId: "74",
    });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(markTelegramEventFailedMock).toHaveBeenCalledWith({
      eventId: "event-telegram-1",
      error: expect.any(Error),
    });
  });

  it("treats an already-claimed duplicate as a safe no-op", async () => {
    const { processTelegramEventById } = await import("./service");
    claimTelegramEventMock.mockResolvedValue(null);

    const result = await processTelegramEventById("event-telegram-1");

    expect(result).toEqual({ status: "claimed_elsewhere" });
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("returns and logs no raw chat identifier when sending fails", async () => {
    const { processTelegramEventById } = await import("./service");
    claimTelegramEventMock.mockResolvedValue(eventRow());
    const sendText = vi.fn().mockRejectedValue(new Error("Telegram send failed"));

    const result = await processTelegramEventById("event-telegram-1", {
      outboundClient: { sendText },
    });

    expect(JSON.stringify(result)).not.toContain("8123456789");
    expect(JSON.stringify(logTelegramErrorMock.mock.calls)).not.toContain("8123456789");
    expect(result.status).toBe("error");
  });

  it("processes only the bounded retry list", async () => {
    const { retryPendingTelegramEvents } = await import("./service");
    listRetryableTelegramEventsMock.mockResolvedValue([eventRow()]);
    claimTelegramEventMock.mockResolvedValue(eventRow());
    const sendText = vi.fn().mockResolvedValue({ messageId: "74" });

    const result = await retryPendingTelegramEvents({
      limit: 1,
      options: { outboundClient: { sendText } },
    });

    expect(listRetryableTelegramEventsMock).toHaveBeenCalledWith(1);
    expect(result).toMatchObject({ processed: 1, failed: 0 });
  });
});
