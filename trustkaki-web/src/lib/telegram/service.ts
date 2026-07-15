import "server-only";

import type { AgentRunContext, OrchestrateResponse } from "@/lib/agents/contracts";
import { orchestrate } from "@/lib/agents/orchestrator";
import { selectSeniorReply } from "@/lib/messaging/selectSeniorReply";
import { buildOutboundClientMessageId } from "@/lib/persistence/orchestration";
import { loadSeniorContextByMessagingIdentity } from "@/lib/persistence/seniorContextRepository";
import { recordSeniorResponse } from "@/lib/persistence/proactiveCheckInRepository";
import {
  acceptTelegramEvent,
  claimTelegramEvent,
  listRetryableTelegramEvents,
  markTelegramEventFailed,
  markTelegramEventProcessed,
  markTelegramOrchestrationCompleted,
  storeTelegramOrchestrationResult,
  updateTelegramOutboundState,
  type PersistedTelegramEvent,
} from "@/lib/persistence/telegramEventRepository";
import {
  persistOrchestrationResult,
  recordInboundMessageMetadata,
  recordOutboundMessageMetadata,
} from "@/lib/persistence/trustkakiRepository";
import type { AgentId, Message } from "@/lib/types";
import { telegramOutboundClient } from "./client";
import { logTelegramError } from "./logging";
import { parseTelegramInboundText } from "./parser";
import type { TelegramOutboundClient } from "./types";

export interface TelegramAcceptResult {
  status: "accepted" | "duplicate" | "ignored";
  eventId?: string;
  duplicate?: boolean;
}

export interface TelegramProcessResult {
  status:
    | "processed"
    | "ignored"
    | "claimed_elsewhere"
    | "senior_not_found"
    | "error";
  inboundMessageId?: string;
  outboundMessageId?: string;
}

interface ProcessTelegramOptions {
  outboundClient?: TelegramOutboundClient;
}

interface TelegramInbound {
  clientMessageId: string;
  externalMessageId: string;
  updateId: string;
  senderUserId: string;
  chatId: string;
  timestamp: string;
  text: string;
}

class UnmappedTelegramSenderError extends Error {
  constructor() {
    super("No senior mapped to Telegram identity");
    this.name = "UnmappedTelegramSenderError";
  }
}

function conciseText(text: string): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized.length > 1000 ? `${normalized.slice(0, 997)}...` : normalized;
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

function inboundFromEvent(event: PersistedTelegramEvent): TelegramInbound | null {
  if (
    event.event_type !== "inbound_text" ||
    !event.telegram_message_id ||
    !event.sender_user_id ||
    !event.chat_id ||
    !event.text_body
  ) {
    return null;
  }

  return {
    clientMessageId: `telegram:${event.update_id}`,
    externalMessageId: event.telegram_message_id,
    updateId: event.update_id,
    senderUserId: event.sender_user_id,
    chatId: event.chat_id,
    timestamp: event.occurred_at ?? event.received_at,
    text: event.text_body,
  };
}

async function getOrCreateOrchestration(args: {
  event: PersistedTelegramEvent;
  inbound: TelegramInbound;
}): Promise<{
  seniorId: string;
  context: AgentRunContext;
  result: OrchestrateResponse;
  replyText: string | null;
  replyAgentId: AgentId | null;
  replyClientMessageId: string | null;
}> {
  const senior = await loadSeniorContextByMessagingIdentity({
    platform: "telegram",
    externalUserId: args.inbound.senderUserId,
    externalChatId: args.inbound.chatId,
  });
  if (!senior) throw new UnmappedTelegramSenderError();

  if (
    args.event.orchestration_result &&
    args.event.orchestration_context &&
    isOrchestrateResponse(args.event.orchestration_result) &&
    isAgentRunContext(args.event.orchestration_context)
  ) {
    return {
      seniorId: senior.seniorId,
      context: args.event.orchestration_context,
      result: args.event.orchestration_result,
      replyText: args.event.selected_reply_text,
      replyAgentId: args.event.selected_reply_agent_id,
      replyClientMessageId: args.event.selected_reply_client_message_id,
    };
  }

  const inboundMessage: Message = {
    id: args.inbound.clientMessageId,
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
  const replyText = reply ? conciseText(reply.text) : null;
  const replyClientMessageId = reply
    ? buildOutboundClientMessageId(result, reply.index)
    : null;

  await storeTelegramOrchestrationResult({
    eventId: args.event.id,
    context,
    result,
    selectedReplyText: replyText,
    selectedReplyAgentId: reply?.agentId ?? null,
    selectedReplyClientMessageId: replyClientMessageId,
  });

  return {
    seniorId: senior.seniorId,
    context,
    result,
    replyText,
    replyAgentId: reply?.agentId ?? null,
    replyClientMessageId,
  };
}

async function persistOrchestrationIfNeeded(args: {
  event: PersistedTelegramEvent;
  inbound: TelegramInbound;
  seniorId: string;
  context: AgentRunContext;
  result: OrchestrateResponse;
}): Promise<void> {
  if (args.event.orchestration_completed_at) return;

  await persistOrchestrationResult({
    seniorId: args.seniorId,
    message: args.inbound.text,
    clientMessageId: args.inbound.clientMessageId,
    context: args.context,
    result: args.result,
  });
  await recordInboundMessageMetadata({
    externalPlatform: "telegram",
    clientMessageId: args.inbound.clientMessageId,
    externalMessageId: args.inbound.externalMessageId,
    externalMetadata: {
      direction: "inbound",
      source: "webhook",
      update_id: args.inbound.updateId,
    },
  });
  await recordSeniorResponse({
    seniorId: args.seniorId,
    clientMessageId: args.inbound.clientMessageId,
    respondedAt: args.inbound.timestamp,
  });
  await markTelegramOrchestrationCompleted(args.event.id);
}

async function sendOrResumeOutbound(args: {
  event: PersistedTelegramEvent;
  inbound: TelegramInbound;
  replyText: string | null;
  replyAgentId: AgentId | null;
  replyClientMessageId: string | null;
  outboundClient: TelegramOutboundClient;
}): Promise<string | null> {
  if (!args.replyText || !args.replyClientMessageId) {
    await markTelegramEventProcessed(args.event.id);
    return null;
  }

  let outboundMessageId = args.event.outbound_message_id;
  if (args.event.outbound_status !== "accepted" || !outboundMessageId) {
    await updateTelegramOutboundState({
      eventId: args.event.id,
      outboundStatus: "pending",
    });
    const outbound = await args.outboundClient.sendText({
      chatId: args.inbound.chatId,
      text: args.replyText,
    });
    outboundMessageId = outbound.messageId;
    await updateTelegramOutboundState({
      eventId: args.event.id,
      outboundStatus: "accepted",
      outboundMessageId,
    });
  }

  await recordOutboundMessageMetadata({
    externalPlatform: "telegram",
    clientMessageId: args.replyClientMessageId,
    externalMessageId: outboundMessageId,
    externalMetadata: {
      delivery_state: "provider_accepted",
      source_inbound_message_id: args.inbound.externalMessageId,
      selected_agent_id: args.replyAgentId,
    },
  });
  await markTelegramEventProcessed(args.event.id);
  return outboundMessageId;
}

export async function acceptTelegramWebhookEvent(
  payload: unknown
): Promise<TelegramAcceptResult> {
  const inbound = parseTelegramInboundText(payload);
  if (!inbound) return { status: "ignored" };

  const accepted = await acceptTelegramEvent({
    updateId: inbound.updateId,
    telegramMessageId: inbound.messageId,
    senderUserId: inbound.senderUserId,
    chatId: inbound.chatId,
    occurredAt: inbound.timestamp,
    text: inbound.text,
    payload:
      typeof payload === "object" && payload !== null && !Array.isArray(payload)
        ? (payload as Record<string, unknown>)
        : {},
  });
  return {
    status: accepted.duplicate ? "duplicate" : "accepted",
    eventId: accepted.row.id,
    duplicate: accepted.duplicate,
  };
}

export async function processTelegramEventById(
  eventId: string,
  options: ProcessTelegramOptions = {}
): Promise<TelegramProcessResult> {
  const event = await claimTelegramEvent(eventId);
  if (!event) return { status: "claimed_elsewhere" };

  if (event.event_type !== "inbound_text") {
    await markTelegramEventProcessed(event.id);
    return { status: "ignored" };
  }

  try {
    const inbound = inboundFromEvent(event);
    if (!inbound) throw new Error("Accepted Telegram event is incomplete");

    const orchestration = await getOrCreateOrchestration({ event, inbound });
    await persistOrchestrationIfNeeded({
      event,
      inbound,
      seniorId: orchestration.seniorId,
      context: orchestration.context,
      result: orchestration.result,
    });
    const outboundMessageId = await sendOrResumeOutbound({
      event,
      inbound,
      replyText: orchestration.replyText,
      replyAgentId: orchestration.replyAgentId,
      replyClientMessageId: orchestration.replyClientMessageId,
      outboundClient: options.outboundClient ?? telegramOutboundClient,
    });

    return {
      status: "processed",
      inboundMessageId: inbound.externalMessageId,
      outboundMessageId: outboundMessageId ?? undefined,
    };
  } catch (error) {
    if (error instanceof UnmappedTelegramSenderError) {
      await markTelegramEventProcessed(event.id);
      return {
        status: "senior_not_found",
        inboundMessageId: event.telegram_message_id ?? undefined,
      };
    }

    await markTelegramEventFailed({ eventId: event.id, error }).catch((markError) =>
      logTelegramError({
        category: "mark-event-failed",
        eventId: event.id,
        error: markError,
      })
    );
    logTelegramError({
      category: "event-processing-failed",
      eventId: event.id,
      error,
    });
    return {
      status: "error",
      inboundMessageId: event.telegram_message_id ?? undefined,
    };
  }
}

export async function retryPendingTelegramEvents(args: {
  limit: number;
  options?: ProcessTelegramOptions;
}): Promise<{ processed: number; failed: number; skipped: number; statuses: string[] }> {
  const events = await listRetryableTelegramEvents(args.limit);
  const statuses: string[] = [];
  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const event of events) {
    const result = await processTelegramEventById(event.id, args.options);
    statuses.push(result.status);
    if (
      result.status === "processed" ||
      result.status === "ignored" ||
      result.status === "senior_not_found"
    ) {
      processed += 1;
    } else if (result.status === "claimed_elsewhere") {
      skipped += 1;
    } else {
      failed += 1;
    }
  }

  return { processed, failed, skipped, statuses };
}
