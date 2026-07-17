import "server-only";

import { orchestrate } from "@/lib/agents/orchestrator";
import type { AgentRunContext, OrchestrateResponse, OrchestrationResult } from "@/lib/agents/contracts";
import type { AgentId, Message } from "@/lib/types";
import { selectSeniorReply } from "@/lib/messaging/selectSeniorReply";
import {
  hasPersistedMessageClientId,
  persistOrchestrationResult,
  recordInboundMessageMetadata,
  recordOutboundMessageMetadata,
  recordWhatsAppDeliveryStatus,
} from "@/lib/persistence/trustkakiRepository";
import { loadSeniorContextByVerifiedPhone } from "@/lib/persistence/seniorContextRepository";
import {
  buildOutboundClientMessageId,
  restoreOrchestrationRetryEnvelope,
} from "@/lib/persistence/orchestration";
import {
  acceptWhatsAppEvent,
  claimWhatsAppEvent,
  listRetryableWhatsAppEvents,
  markWhatsAppEventFailed,
  markWhatsAppEventProcessed,
  markWhatsAppOrchestrationCompleted,
  storeWhatsAppOrchestrationResult,
  updateWhatsAppOutboundState,
  type PersistedWhatsAppEvent,
} from "@/lib/persistence/whatsappEventRepository";
import { parseInboundTextMessages, parseWhatsAppWebhookEvents } from "./parser";
import {
  whatsAppOutboundClient,
  type SendWhatsAppTextParams,
  type WhatsAppOutboundClient,
} from "./client";
import { logWhatsAppError } from "./logging";
import type {
  WhatsAppAcceptResult,
  WhatsAppInboundTextMessage,
  WhatsAppProcessResult,
  WhatsAppSendTextResult,
} from "./types";

interface ProcessWhatsAppWebhookOptions {
  sendText?: (params: SendWhatsAppTextParams) => Promise<WhatsAppSendTextResult>;
  outboundClient?: WhatsAppOutboundClient;
}

class UnmappedWhatsAppSenderError extends Error {
  constructor() {
    super("No senior mapped to sender phone");
    this.name = "UnmappedWhatsAppSenderError";
  }
}

function conciseText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 1000 ? `${normalized.slice(0, 997)}...` : normalized;
}

function getInboundMessageFromEvent(
  event: PersistedWhatsAppEvent
): WhatsAppInboundTextMessage | null {
  const payload = event.payload as {
    text?: { body?: unknown };
    timestamp?: unknown;
  };
  const text = payload.text?.body;
  if (
    event.event_type !== "inbound_text" ||
    !event.sender_phone_e164 ||
    !event.phone_number_id ||
    typeof text !== "string"
  ) {
    return null;
  }

  return {
    id: event.whatsapp_message_id,
    from: event.sender_phone_e164,
    timestamp: event.received_at,
    text,
    phoneNumberId: event.phone_number_id,
  };
}

function getDeliveryStatusFromEvent(event: PersistedWhatsAppEvent): {
  externalMessageId: string;
  status: "sent" | "delivered" | "read" | "failed";
  statusAt: string;
} | null {
  if (!event.event_type.startsWith("status_") || !event.related_whatsapp_message_id) {
    return null;
  }

  const status = event.event_type.slice("status_".length);
  if (!(["sent", "delivered", "read", "failed"] as const).includes(
    status as "sent" | "delivered" | "read" | "failed"
  )) {
    return null;
  }

  const payload = event.payload as { timestamp?: unknown };
  const seconds =
    typeof payload.timestamp === "string" ? Number(payload.timestamp) : Number.NaN;
  const statusAt =
    Number.isFinite(seconds) && seconds > 0
      ? new Date(seconds * 1000).toISOString()
      : event.received_at;

  return {
    externalMessageId: event.related_whatsapp_message_id,
    status: status as "sent" | "delivered" | "read" | "failed",
    statusAt,
  };
}

function isOrchestrateResponse(value: unknown): value is OrchestrateResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as OrchestrateResponse).messages) &&
    Array.isArray((value as OrchestrateResponse).traces) &&
    typeof (value as OrchestrateResponse).policy === "object"
  );
}

function isAgentRunContext(value: unknown): value is AgentRunContext {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as AgentRunContext).senior === "object" &&
    Array.isArray((value as AgentRunContext).messages)
  );
}

function completedLegacyResult(value: OrchestrateResponse): OrchestrationResult {
  const result = { ...value } as OrchestrationResult;
  Object.defineProperty(result, "contextMemoryCandidates", {
    value: [],
    enumerable: false,
  });
  return result;
}

async function getOrCreateOrchestration(args: {
  event: PersistedWhatsAppEvent;
  inbound: WhatsAppInboundTextMessage;
}): Promise<{
  seniorId: string;
  context: AgentRunContext;
  result: OrchestrationResult;
  replyText: string | null;
  replyAgentId: AgentId | null;
  replyClientMessageId: string | null;
  persistenceAlreadyCompleted: boolean;
}> {
  const senior = await loadSeniorContextByVerifiedPhone({ phone: args.inbound.from });
  if (!senior) {
    throw new UnmappedWhatsAppSenderError();
  }

  if (args.event.orchestration_result && isAgentRunContext(args.event.orchestration_context)) {
    try {
      return {
        seniorId: senior.seniorId,
        context: args.event.orchestration_context,
        result: restoreOrchestrationRetryEnvelope(args.event.orchestration_result),
        replyText: args.event.selected_reply_text,
        replyAgentId: args.event.selected_reply_agent_id,
        replyClientMessageId: args.event.selected_reply_client_message_id,
        persistenceAlreadyCompleted: Boolean(args.event.orchestration_completed_at),
      };
    } catch {
      if (!isOrchestrateResponse(args.event.orchestration_result)) {
        throw new Error("invalid cached orchestration retry envelope");
      }
      if (args.event.orchestration_completed_at) {
        return {
          seniorId: senior.seniorId,
          context: args.event.orchestration_context,
          result: completedLegacyResult(args.event.orchestration_result),
          replyText: args.event.selected_reply_text,
          replyAgentId: args.event.selected_reply_agent_id,
          replyClientMessageId: args.event.selected_reply_client_message_id,
          persistenceAlreadyCompleted: true,
        };
      }
      if (args.event.outbound_message_id || args.event.outbound_status === "sent") {
        throw new Error("legacy orchestration retry is unsafe after provider acceptance");
      }
      if (await hasPersistedMessageClientId(args.inbound.id)) {
        return {
          seniorId: senior.seniorId,
          context: args.event.orchestration_context,
          result: completedLegacyResult(args.event.orchestration_result),
          replyText: args.event.selected_reply_text,
          replyAgentId: args.event.selected_reply_agent_id,
          replyClientMessageId: args.event.selected_reply_client_message_id,
          persistenceAlreadyCompleted: true,
        };
      }
    }
  }

  const inboundMessage: Message = {
    id: args.inbound.id,
    sender: "senior",
    text: args.inbound.text,
    timestamp: args.inbound.timestamp,
  };
  const context: AgentRunContext = {
    ...senior.context,
    messages: [inboundMessage],
  };

  const result = await orchestrate(args.inbound.text, context);
  const reply = selectSeniorReply(result);
  const replyClientMessageId = reply
    ? buildOutboundClientMessageId(result, reply.index)
    : null;

  await storeWhatsAppOrchestrationResult({
    eventId: args.event.id,
    context,
    result,
    selectedReplyText: reply ? conciseText(reply.text) : null,
    selectedReplyAgentId: reply?.agentId ?? null,
    selectedReplyClientMessageId: replyClientMessageId,
  });

  return {
    seniorId: senior.seniorId,
    context,
    result,
    replyText: reply ? conciseText(reply.text) : null,
    replyAgentId: reply?.agentId ?? null,
    replyClientMessageId,
    persistenceAlreadyCompleted: false,
  };
}

async function persistOrchestrationIfNeeded(args: {
  event: PersistedWhatsAppEvent;
  inbound: WhatsAppInboundTextMessage;
  seniorId: string;
  context: AgentRunContext;
  result: OrchestrationResult;
  persistenceAlreadyCompleted: boolean;
}): Promise<void> {
  if (args.event.orchestration_completed_at) return;

  if (!args.persistenceAlreadyCompleted) {
    await persistOrchestrationResult({
      seniorId: args.seniorId,
      message: args.inbound.text,
      clientMessageId: args.inbound.id,
      context: args.context,
      result: args.result,
    });
  }
  await recordInboundMessageMetadata({
    externalPlatform: "whatsapp",
    clientMessageId: args.inbound.id,
    externalMessageId: args.inbound.id,
    externalMetadata: {
      direction: "inbound",
      phone_number_id: args.inbound.phoneNumberId,
      source: "webhook",
    },
  });
  await markWhatsAppOrchestrationCompleted(args.event.id);
}

async function sendOrResumeOutbound(args: {
  event: PersistedWhatsAppEvent;
  inbound: WhatsAppInboundTextMessage;
  replyText: string | null;
  replyAgentId: AgentId | null;
  replyClientMessageId: string | null;
  outboundClient: WhatsAppOutboundClient;
}): Promise<string | null> {
  if (!args.replyText || !args.replyClientMessageId) {
    await markWhatsAppEventProcessed(args.event.id);
    return null;
  }

  let outboundMessageId = args.event.outbound_message_id;
  if (args.event.outbound_status !== "sent" || !outboundMessageId) {
    await updateWhatsAppOutboundState({
      eventId: args.event.id,
      outboundStatus: "pending",
    });
    const outbound = await args.outboundClient.sendText({
      to: args.inbound.from,
      text: args.replyText,
      phoneNumberId: args.inbound.phoneNumberId,
    });
    outboundMessageId = outbound.messageId;

    // If this update fails after Meta accepted the send, the next retry cannot
    // prove whether Meta sent the message. Keeping the outbound ID here before
    // metadata persistence avoids intentional duplicate sends after this point.
    await updateWhatsAppOutboundState({
      eventId: args.event.id,
      outboundStatus: "sent",
      outboundMessageId,
    });
  }

  await recordOutboundMessageMetadata({
    externalPlatform: "whatsapp",
    clientMessageId: args.replyClientMessageId,
    externalMessageId: outboundMessageId,
    externalMetadata: {
      platform: "whatsapp",
      phone_number_id: args.inbound.phoneNumberId,
      source_inbound_message_id: args.inbound.id,
      selected_agent_id: args.replyAgentId,
    },
  });
  await markWhatsAppEventProcessed(args.event.id);
  return outboundMessageId;
}

export async function acceptWhatsAppWebhookEvent(
  payload: unknown
): Promise<WhatsAppAcceptResult> {
  const events = parseWhatsAppWebhookEvents(payload);
  if (events.length === 0) {
    return {
      status: "ignored",
      events: [],
      reason: "No supported WhatsApp text or status event",
    };
  }

  const accepted = await Promise.all(
    events.map(async (event) => {
      const result = await acceptWhatsAppEvent(event);
      return {
        eventId: result.row.id,
        whatsappMessageId: result.row.whatsapp_message_id,
        eventType: result.row.event_type,
        duplicate: result.duplicate,
        processable: !result.duplicate,
      };
    })
  );

  return {
    status: accepted.every((event) => event.duplicate) ? "duplicate" : "accepted",
    events: accepted,
  };
}

export async function processWhatsAppEventById(
  eventId: string,
  options: ProcessWhatsAppWebhookOptions = {}
): Promise<WhatsAppProcessResult> {
  const event = await claimWhatsAppEvent(eventId);
  if (!event) return { status: "claimed_elsewhere" };

  if (event.event_type !== "inbound_text") {
    const delivery = getDeliveryStatusFromEvent(event);
    if (!delivery) {
      await markWhatsAppEventProcessed(event.id);
      return { status: "ignored", inboundMessageId: event.whatsapp_message_id };
    }

    try {
      await recordWhatsAppDeliveryStatus(delivery);
      await markWhatsAppEventProcessed(event.id);
      return {
        status: "processed",
        inboundMessageId: event.related_whatsapp_message_id ?? undefined,
      };
    } catch (error) {
      await markWhatsAppEventFailed({ eventId: event.id, error }).catch((markError) =>
        logWhatsAppError("failed to mark WhatsApp status event failed", markError)
      );
      logWhatsAppError("WhatsApp delivery status processing failed", error);
      return {
        status: "error",
        inboundMessageId: event.related_whatsapp_message_id ?? undefined,
      };
    }
  }

  try {
    const inbound = getInboundMessageFromEvent(event);
    if (!inbound) {
      await markWhatsAppEventFailed({
        eventId: event.id,
        error: new Error("Accepted WhatsApp event is missing inbound text fields"),
      });
      return { status: "error", inboundMessageId: event.whatsapp_message_id };
    }

    const orchestration = await getOrCreateOrchestration({ event, inbound });
    await persistOrchestrationIfNeeded({
      event,
      inbound,
      seniorId: orchestration.seniorId,
      context: orchestration.context,
      result: orchestration.result,
      persistenceAlreadyCompleted: orchestration.persistenceAlreadyCompleted,
    });

    const outboundClient =
      options.outboundClient ??
      (options.sendText ? { sendText: options.sendText } : whatsAppOutboundClient);
    const outboundMessageId = await sendOrResumeOutbound({
      event,
      inbound,
      replyText: orchestration.replyText,
      replyAgentId: orchestration.replyAgentId,
      replyClientMessageId: orchestration.replyClientMessageId,
      outboundClient,
    });

    return {
      status: "processed",
      inboundMessageId: inbound.id,
      outboundMessageId: outboundMessageId ?? undefined,
    };
  } catch (error) {
    if (error instanceof UnmappedWhatsAppSenderError) {
      await markWhatsAppEventProcessed(event.id);
      return {
        status: "senior_not_found",
        inboundMessageId: event.whatsapp_message_id,
      };
    }

    await markWhatsAppEventFailed({
      eventId: event.id,
      error,
      outboundStatus:
        event.outbound_status === "sent" ? "sent" : event.outbound_status,
    }).catch((markError) =>
      logWhatsAppError("failed to mark WhatsApp event failed", markError)
    );
    logWhatsAppError("WhatsApp event processing failed", error);
    return { status: "error", inboundMessageId: event.whatsapp_message_id };
  }
}

export async function retryPendingWhatsAppEvents(args: {
  limit: number;
  options?: ProcessWhatsAppWebhookOptions;
}): Promise<{ processed: number; failed: number; skipped: number; statuses: string[] }> {
  const events = await listRetryableWhatsAppEvents(args.limit);
  const statuses: string[] = [];
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const result = await processWhatsAppEventById(event.id, args.options);
    statuses.push(result.status);
    if (
      result.status === "processed" ||
      result.status === "ignored" ||
      result.status === "senior_not_found"
    ) {
      processed += 1;
    }
    else if (result.status === "claimed_elsewhere") skipped += 1;
    else failed += 1;
  }

  return { processed, failed, skipped, statuses };
}

export async function processWhatsAppWebhookPayload(
  payload: unknown,
  options: ProcessWhatsAppWebhookOptions = {}
): Promise<WhatsAppProcessResult> {
  const messages = parseInboundTextMessages(payload);
  if (messages.length === 0) {
    return { status: "ignored", reason: "No supported inbound text message" };
  }

  const accepted = await acceptWhatsAppWebhookEvent(payload);
  const event = accepted.events.find((item) => item.eventType === "inbound_text");
  if (!event) return { status: "ignored" };
  if (event.duplicate) {
    return { status: "duplicate", inboundMessageId: event.whatsappMessageId };
  }

  return processWhatsAppEventById(event.eventId, options);
}
