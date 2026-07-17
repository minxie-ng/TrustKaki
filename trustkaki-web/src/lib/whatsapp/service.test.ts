import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgentRunContext, OrchestrateResponse, OrchestrationResult } from "@/lib/agents/contracts";
import { serializeOrchestrationRetryEnvelope } from "@/lib/persistence/orchestration";
import type { Database, Json } from "@/lib/supabase/types";
import { buildMetaStatusWebhookFixture, buildMetaTextWebhookFixture } from "./parser";

vi.mock("server-only", () => ({}));

const orchestrateMock = vi.fn();
const loadSeniorContextByVerifiedPhoneMock = vi.fn();
const persistOrchestrationResultMock = vi.fn();
const hasPersistedMessageClientIdMock = vi.fn();
const recordInboundMessageMetadataMock = vi.fn();
const recordOutboundMessageMetadataMock = vi.fn();
const recordWhatsAppDeliveryStatusMock = vi.fn();
const acceptWhatsAppEventMock = vi.fn();
const claimWhatsAppEventMock = vi.fn();
const listRetryableWhatsAppEventsMock = vi.fn();
const storeWhatsAppOrchestrationResultMock = vi.fn();
const markWhatsAppOrchestrationCompletedMock = vi.fn();
const updateWhatsAppOutboundStateMock = vi.fn();
const markWhatsAppEventProcessedMock = vi.fn();
const markWhatsAppEventFailedMock = vi.fn();

vi.mock("@/lib/agents/orchestrator", () => ({
  orchestrate: orchestrateMock,
}));

vi.mock("@/lib/persistence/trustkakiRepository", () => ({
  hasPersistedMessageClientId: hasPersistedMessageClientIdMock,
  persistOrchestrationResult: persistOrchestrationResultMock,
  recordInboundMessageMetadata: recordInboundMessageMetadataMock,
  recordOutboundMessageMetadata: recordOutboundMessageMetadataMock,
  recordWhatsAppDeliveryStatus: recordWhatsAppDeliveryStatusMock,
}));

vi.mock("@/lib/persistence/seniorContextRepository", () => ({
  loadSeniorContextByVerifiedPhone: loadSeniorContextByVerifiedPhoneMock,
}));

vi.mock("@/lib/persistence/whatsappEventRepository", () => ({
  acceptWhatsAppEvent: acceptWhatsAppEventMock,
  claimWhatsAppEvent: claimWhatsAppEventMock,
  listRetryableWhatsAppEvents: listRetryableWhatsAppEventsMock,
  storeWhatsAppOrchestrationResult: storeWhatsAppOrchestrationResultMock,
  markWhatsAppOrchestrationCompleted: markWhatsAppOrchestrationCompletedMock,
  updateWhatsAppOutboundState: updateWhatsAppOutboundStateMock,
  markWhatsAppEventProcessed: markWhatsAppEventProcessedMock,
  markWhatsAppEventFailed: markWhatsAppEventFailedMock,
}));

type WhatsAppEventRow =
  Database["public"]["Tables"]["whatsapp_webhook_events"]["Row"];

const seniorId = "00000000-0000-4000-8000-00000000000b";
const agentContext: AgentRunContext = {
    senior: {
      name: "Uncle Tan",
      age: 76,
      livingSituation: "Lives alone",
      caregiver: "Rachel Tan",
      aacVolunteer: "Mei Ling",
    },
    messages: [],
    currentRiskLevel: "green",
};
const context = {
  seniorId,
  context: agentContext,
};

const orchestrationResponse: OrchestrateResponse = {
  messages: [
    {
      text: "I hear you. Since your knee hurts and you skipped breakfast, please take it easy. I can let Rachel know.",
      agentId: "triage",
    },
  ],
  traces: [
    {
      id: "trace_orchestrator",
      agentId: "orchestrator",
      agentName: "Orchestrator Agent",
      timestamp: "2026-07-11T00:00:00.000Z",
      input: "input",
      reasoning: "reasoning",
      output: "{}",
      tags: ["llm_success"],
      fallback: false,
    },
    {
      id: "trace_policy",
      agentId: "policy",
      agentName: "Policy",
      timestamp: "2026-07-11T00:00:00.000Z",
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
  signals: [
    { type: "health", description: "Knee pain", severity: "medium" },
  ],
  policy: {
    finalRisk: "yellow",
    riskChange: "increase",
    briefingRequired: false,
    alerts: [],
    reasoning: ["Medium health -> Yellow"],
  },
  briefing: null,
};

function orchestrationResult(): OrchestrationResult {
  const result = { ...orchestrationResponse } as OrchestrationResult;
  Object.defineProperty(result, "contextMemoryCandidates", {
    value: [{
      targetStore: "memory",
      contextKey: "meal_preference",
      contextType: "food_preference",
      content: "Prefers porridge for breakfast",
      sourceMessageId: "wamid.inbound",
      evidenceExcerpt: "Not hungry today.",
      confidence: 0.93,
      applicationTags: ["practical_meal_prompt"],
      retentionClass: "preference",
    }],
    enumerable: false,
  });
  return result;
}

function payload(messageId = "wamid.inbound") {
  return buildMetaTextWebhookFixture({
    messageId,
    from: "6581234567",
    phoneNumberId: "phone_123",
    text: "Not hungry today. Knee pain.",
    timestamp: "1783766400",
  });
}

function eventRow(overrides: Partial<WhatsAppEventRow> = {}): WhatsAppEventRow {
  return {
    id: "event_1",
    whatsapp_message_id: "wamid.inbound",
    event_type: "inbound_text",
    phone_number_id: "phone_123",
    sender_phone_e164: "6581234567",
    related_whatsapp_message_id: null,
    payload: {
      id: "wamid.inbound",
      from: "6581234567",
      timestamp: "1783766400",
      type: "text",
      text: { body: "Not hungry today. Knee pain." },
    },
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
    received_at: "2026-07-11T00:00:00.000Z",
    processed_at: null,
    created_at: "2026-07-11T00:00:00.000Z",
    updated_at: "2026-07-11T00:00:00.000Z",
    ...overrides,
  };
}

describe("WhatsApp async service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadSeniorContextByVerifiedPhoneMock.mockResolvedValue(context);
    orchestrateMock.mockResolvedValue(orchestrationResponse);
    persistOrchestrationResultMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    hasPersistedMessageClientIdMock.mockResolvedValue(false);
    recordOutboundMessageMetadataMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    recordInboundMessageMetadataMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    recordWhatsAppDeliveryStatusMock.mockResolvedValue({
      mode: "supabase",
      configured: true,
      persisted: true,
    });
    storeWhatsAppOrchestrationResultMock.mockResolvedValue(undefined);
    markWhatsAppOrchestrationCompletedMock.mockResolvedValue(undefined);
    updateWhatsAppOutboundStateMock.mockResolvedValue(undefined);
    markWhatsAppEventProcessedMock.mockResolvedValue(undefined);
    markWhatsAppEventFailedMock.mockResolvedValue(undefined);
  });

  it("accepts durable events and reports duplicates", async () => {
    const { acceptWhatsAppWebhookEvent } = await import("./service");
    acceptWhatsAppEventMock.mockResolvedValue({
      row: eventRow(),
      duplicate: true,
    });

    const result = await acceptWhatsAppWebhookEvent(payload());

    expect(result.status).toBe("duplicate");
    expect(result.events[0]).toMatchObject({
      eventId: "event_1",
      duplicate: true,
      processable: false,
    });
  });

  it("processes a claimed event once and persists policy-authoritative result", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValue(eventRow());
    const sendText = vi.fn().mockResolvedValue({
      messageId: "wamid.outbound",
      raw: { messages: [{ id: "wamid.outbound" }] },
    });

    const result = await processWhatsAppEventById("event_1", { sendText });

    expect(result).toMatchObject({
      status: "processed",
      inboundMessageId: "wamid.inbound",
      outboundMessageId: "wamid.outbound",
    });
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(persistOrchestrationResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        seniorId,
        clientMessageId: "wamid.inbound",
        result: expect.objectContaining({
          policy: expect.objectContaining({ finalRisk: "yellow" }),
        }),
      })
    );
    expect(recordInboundMessageMetadataMock).toHaveBeenCalledWith({
      externalPlatform: "whatsapp",
      clientMessageId: "wamid.inbound",
      externalMessageId: "wamid.inbound",
      externalMetadata: {
        direction: "inbound",
        phone_number_id: "phone_123",
        source: "webhook",
      },
    });
    expect(sendText).toHaveBeenCalledTimes(1);
    expect(recordOutboundMessageMetadataMock).toHaveBeenCalledWith(
      expect.objectContaining({
        clientMessageId: "out_trace_orchestrator_0",
        externalMessageId: "wamid.outbound",
      })
    );
  });

  it("does not map an unknown phone to demo identity or run orchestration", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValue(eventRow());
    loadSeniorContextByVerifiedPhoneMock.mockResolvedValue(null);

    const result = await processWhatsAppEventById("event_1", { sendText: vi.fn() });

    expect(result.status).toBe("senior_not_found");
    expect(loadSeniorContextByVerifiedPhoneMock).toHaveBeenCalledWith({
      phone: "6581234567",
    });
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
    expect(markWhatsAppEventProcessedMock).toHaveBeenCalledWith("event_1");
    expect(markWhatsAppEventFailedMock).not.toHaveBeenCalled();
  });

  it("does not rerun orchestration when retrying a stored outbound failure", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValue(
      eventRow({
        status: "failed",
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: {
          ...context.context,
          messages: [
            {
              id: "wamid.inbound",
              sender: "senior",
              text: "Not hungry today. Knee pain.",
              timestamp: "2026-07-11T00:00:00.000Z",
            },
          ],
        },
        orchestration_completed_at: "2026-07-11T00:00:05.000Z",
        selected_reply_text: orchestrationResponse.messages[0].text,
        selected_reply_agent_id: "triage",
        selected_reply_client_message_id: "out_trace_orchestrator_0",
        outbound_status: "failed",
      })
    );
    const sendText = vi.fn().mockResolvedValue({
      messageId: "wamid.outbound.retry",
      raw: { messages: [{ id: "wamid.outbound.retry" }] },
    });

    const result = await processWhatsAppEventById("event_1", { sendText });

    expect(result.status).toBe("processed");
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("restores private memory candidates when retrying incomplete persistence", async () => {
    const { processWhatsAppEventById } = await import("./service");
    const storedResult = orchestrationResult();
    claimWhatsAppEventMock.mockResolvedValue(
      eventRow({
        status: "failed",
        orchestration_result: serializeOrchestrationRetryEnvelope(storedResult) as unknown as Json,
        orchestration_context: {
          ...agentContext,
          messages: [{
            id: "wamid.inbound",
            sender: "senior",
            text: "Not hungry today. Knee pain.",
            timestamp: "2026-07-11T00:00:00.000Z",
          }],
        },
        selected_reply_text: orchestrationResponse.messages[0].text,
        selected_reply_agent_id: "triage",
        selected_reply_client_message_id: "out_trace_orchestrator_0",
        outbound_status: "pending",
      })
    );

    const result = await processWhatsAppEventById("event_1", {
      sendText: vi.fn().mockResolvedValue({ messageId: "wamid.retry", raw: {} }),
    });

    expect(result.status).toBe("processed");
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).toHaveBeenCalledWith(
      expect.objectContaining({
        result: expect.objectContaining({
          contextMemoryCandidates: storedResult.contextMemoryCandidates,
        }),
      })
    );
  });

  it("does not re-orchestrate a legacy incomplete cache after provider acceptance", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValue(
      eventRow({
        status: "failed",
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: agentContext as unknown as Json,
        outbound_status: "sent",
        outbound_message_id: "wamid.outbound",
      })
    );
    const sendText = vi.fn();

    const result = await processWhatsAppEventById("event_1", { sendText });

    expect(result.status).toBe("error");
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("re-orchestrates a legacy incomplete cache before any provider acceptance", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValue(
      eventRow({
        status: "failed",
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: agentContext as unknown as Json,
        outbound_status: "pending",
      })
    );

    const result = await processWhatsAppEventById("event_1", {
      sendText: vi.fn().mockResolvedValue({ messageId: "wamid.retry", raw: {} }),
    });

    expect(result.status).toBe("processed");
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(storeWhatsAppOrchestrationResultMock).toHaveBeenCalledTimes(1);
    expect(persistOrchestrationResultMock).toHaveBeenCalledTimes(1);
  });

  it("resumes a legacy cache without re-orchestrating when inbound persistence exists", async () => {
    const { processWhatsAppEventById } = await import("./service");
    hasPersistedMessageClientIdMock.mockResolvedValue(true);
    claimWhatsAppEventMock.mockResolvedValue(
      eventRow({
        status: "failed",
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: agentContext as unknown as Json,
        selected_reply_text: orchestrationResponse.messages[0].text,
        selected_reply_agent_id: "triage",
        selected_reply_client_message_id: "out_trace_orchestrator_0",
        outbound_status: "pending",
      })
    );
    const sendText = vi.fn().mockResolvedValue({
      messageId: "wamid.retry",
      raw: {},
    });

    const result = await processWhatsAppEventById("event_1", { sendText });

    expect(result.status).toBe("processed");
    expect(hasPersistedMessageClientIdMock).toHaveBeenCalledWith("wamid.inbound");
    expect(orchestrateMock).not.toHaveBeenCalled();
    expect(persistOrchestrationResultMock).not.toHaveBeenCalled();
    expect(recordInboundMessageMetadataMock).toHaveBeenCalledTimes(1);
    expect(markWhatsAppOrchestrationCompletedMock).toHaveBeenCalledTimes(1);
    expect(sendText).toHaveBeenCalledTimes(1);
  });

  it("marks outbound failure retryable, then recovers without rerunning orchestration", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValueOnce(eventRow());
    const failingSend = vi.fn().mockRejectedValue(new Error("Meta HTTP 500"));

    const failed = await processWhatsAppEventById("event_1", {
      sendText: failingSend,
    });

    expect(failed.status).toBe("error");
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(storeWhatsAppOrchestrationResultMock).toHaveBeenCalledTimes(1);
    expect(markWhatsAppEventFailedMock).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId: "event_1",
      })
    );

    claimWhatsAppEventMock.mockResolvedValueOnce(
      eventRow({
        status: "failed",
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: {
          ...context.context,
          messages: [
            {
              id: "wamid.inbound",
              sender: "senior",
              text: "Not hungry today. Knee pain.",
              timestamp: "2026-07-11T00:00:00.000Z",
            },
          ],
        },
        orchestration_completed_at: "2026-07-11T00:00:05.000Z",
        selected_reply_text: orchestrationResponse.messages[0].text,
        selected_reply_agent_id: "triage",
        selected_reply_client_message_id: "out_trace_orchestrator_0",
        outbound_status: "failed",
      })
    );
    const recoverySend = vi.fn().mockResolvedValue({
      messageId: "wamid.outbound.recovered",
      raw: {},
    });

    const recovered = await processWhatsAppEventById("event_1", {
      sendText: recoverySend,
    });

    expect(recovered).toMatchObject({
      status: "processed",
      outboundMessageId: "wamid.outbound.recovered",
    });
    expect(orchestrateMock).toHaveBeenCalledTimes(1);
    expect(recoverySend).toHaveBeenCalledTimes(1);
  });

  it("does not send again when outbound was already marked sent", async () => {
    const { processWhatsAppEventById } = await import("./service");
    claimWhatsAppEventMock.mockResolvedValue(
      eventRow({
        orchestration_result: orchestrationResponse as unknown as Json,
        orchestration_context: context.context as unknown as Json,
        orchestration_completed_at: "2026-07-11T00:00:05.000Z",
        selected_reply_text: orchestrationResponse.messages[0].text,
        selected_reply_agent_id: "triage",
        selected_reply_client_message_id: "out_trace_orchestrator_0",
        outbound_status: "sent",
        outbound_message_id: "wamid.outbound",
      })
    );
    const sendText = vi.fn();

    const result = await processWhatsAppEventById("event_1", { sendText });

    expect(result).toMatchObject({
      status: "processed",
      outboundMessageId: "wamid.outbound",
    });
    expect(sendText).not.toHaveBeenCalled();
    expect(recordOutboundMessageMetadataMock).toHaveBeenCalledTimes(1);
  });

  it("processes delivery status without invoking orchestration", async () => {
    const { acceptWhatsAppWebhookEvent, processWhatsAppEventById } = await import(
      "./service"
    );
    const statusRow = eventRow({
      event_type: "status_delivered",
      whatsapp_message_id: "status:wamid.outbound:delivered:2026-07-11T00:00:00.000Z",
      related_whatsapp_message_id: "wamid.outbound",
      payload: {
        id: "wamid.outbound",
        recipient_id: "6581234567",
        status: "delivered",
        timestamp: "1783766400",
      },
      status: "received",
      received_at: "2026-07-11T00:00:00.000Z",
    });
    acceptWhatsAppEventMock.mockResolvedValue({ row: statusRow, duplicate: false });
    claimWhatsAppEventMock.mockResolvedValue(statusRow);

    const accepted = await acceptWhatsAppWebhookEvent(
      buildMetaStatusWebhookFixture({
        messageId: "wamid.outbound",
        recipientId: "6581234567",
        phoneNumberId: "phone_123",
        status: "delivered",
        timestamp: "1783766400",
      })
    );
    const processed = await processWhatsAppEventById(statusRow.id);

    expect(accepted.events[0].processable).toBe(true);
    expect(processed.status).toBe("processed");
    expect(recordWhatsAppDeliveryStatusMock).toHaveBeenCalledWith({
      externalMessageId: "wamid.outbound",
      status: "delivered",
      statusAt: "2026-07-11T10:40:00.000Z",
    });
    expect(markWhatsAppEventProcessedMock).toHaveBeenCalledWith("event_1");
    expect(orchestrateMock).not.toHaveBeenCalled();
  });

  it("processes a bounded set of retryable events", async () => {
    const { retryPendingWhatsAppEvents } = await import("./service");
    listRetryableWhatsAppEventsMock.mockResolvedValue([eventRow({ id: "event_1" })]);
    claimWhatsAppEventMock.mockResolvedValue(eventRow({ id: "event_1" }));
    const sendText = vi.fn().mockResolvedValue({
      messageId: "wamid.outbound",
      raw: {},
    });

    const result = await retryPendingWhatsAppEvents({
      limit: 1,
      options: { sendText },
    });

    expect(listRetryableWhatsAppEventsMock).toHaveBeenCalledWith(1);
    expect(result.processed).toBe(1);
  });

  it("counts an unmapped sender as safely processed instead of failed", async () => {
    const { retryPendingWhatsAppEvents } = await import("./service");
    listRetryableWhatsAppEventsMock.mockResolvedValue([eventRow({ id: "event_1" })]);
    claimWhatsAppEventMock.mockResolvedValue(eventRow({ id: "event_1" }));
    loadSeniorContextByVerifiedPhoneMock.mockResolvedValue(null);

    const result = await retryPendingWhatsAppEvents({
      limit: 1,
      options: { sendText: vi.fn() },
    });

    expect(result).toEqual({
      processed: 1,
      failed: 0,
      skipped: 0,
      statuses: ["senior_not_found"],
    });
  });
});
