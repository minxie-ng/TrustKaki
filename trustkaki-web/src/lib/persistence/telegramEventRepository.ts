import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentRunContext, OrchestrationResult } from "@/lib/agents/contracts";
import { serializeOrchestrationRetryEnvelope } from "./orchestration";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type {
  Database,
  Json,
  TelegramOutboundStatus,
  TelegramWebhookEventStatus,
} from "@/lib/supabase/types";
import type { AgentId } from "@/lib/types";

type ServiceClient = SupabaseClient;
type TelegramEventRow =
  Database["public"]["Tables"]["telegram_webhook_events"]["Row"];

export type PersistedTelegramEvent = TelegramEventRow;

export interface TelegramWebhookEventInput {
  updateId: string;
  telegramMessageId: string;
  senderUserId: string;
  chatId: string;
  occurredAt: string;
  text: string;
  payload: Record<string, unknown>;
}

function getClient(): ServiceClient {
  const client = createTrustKakiServiceClient();
  if (!client) {
    throw new Error("Supabase is not configured for durable Telegram webhook events");
  }
  return client;
}

function throwIfError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function sanitizeStoredError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw
    .replace(/(bot)\d+:[A-Za-z0-9_-]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._~:-]+/gi, "Bearer [redacted]")
    .slice(0, 500);
}

export async function acceptTelegramEvent(
  event: TelegramWebhookEventInput
): Promise<{ row: TelegramEventRow; duplicate: boolean }> {
  const client = getClient();
  const { data, error } = await client
    .from("telegram_webhook_events")
    .insert({
      update_id: event.updateId,
      event_type: "inbound_text",
      telegram_message_id: event.telegramMessageId,
      sender_user_id: event.senderUserId,
      chat_id: event.chatId,
      text_body: event.text,
      payload: event.payload as Json,
      occurred_at: event.occurredAt,
      status: "received",
      outbound_status: "not_started",
    })
    .select("*")
    .single();

  if (!error && data) return { row: data as TelegramEventRow, duplicate: false };
  if (!isDuplicateError(error)) throwIfError(error, "insert Telegram webhook event");

  const { data: existing, error: selectError } = await client
    .from("telegram_webhook_events")
    .select("*")
    .eq("update_id", event.updateId)
    .single();
  throwIfError(selectError, "select duplicate Telegram webhook event");
  return { row: existing as TelegramEventRow, duplicate: true };
}

export async function claimTelegramEvent(
  eventId: string
): Promise<TelegramEventRow | null> {
  const client = getClient();
  const { data, error } = await client.rpc("claim_telegram_webhook_event", {
    p_event_id: eventId,
  });
  throwIfError(error, "claim Telegram webhook event");
  return (data?.[0] as TelegramEventRow | undefined) ?? null;
}

export async function listRetryableTelegramEvents(
  limit: number
): Promise<TelegramEventRow[]> {
  const client = getClient();
  const boundedLimit = Math.max(1, Math.min(Math.trunc(limit), 25));
  const { data, error } = await client
    .from("telegram_webhook_events")
    .select("*")
    .in("status", ["received", "failed"])
    .order("received_at", { ascending: true })
    .limit(boundedLimit);
  throwIfError(error, "list retryable Telegram webhook events");
  return (data ?? []) as TelegramEventRow[];
}

export async function storeTelegramOrchestrationResult(args: {
  eventId: string;
  context: AgentRunContext;
  result: OrchestrationResult;
  selectedReplyText: string | null;
  selectedReplyAgentId: AgentId | null;
  selectedReplyClientMessageId: string | null;
}): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("telegram_webhook_events")
    .update({
      orchestration_result: serializeOrchestrationRetryEnvelope(args.result) as unknown as Json,
      orchestration_context: args.context as unknown as Json,
      selected_reply_text: args.selectedReplyText,
      selected_reply_agent_id: args.selectedReplyAgentId,
      selected_reply_client_message_id: args.selectedReplyClientMessageId,
      outbound_status: args.selectedReplyText ? "pending" : "not_started",
    })
    .eq("id", args.eventId);
  throwIfError(error, "store Telegram orchestration result");
}

export async function markTelegramOrchestrationCompleted(
  eventId: string
): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("telegram_webhook_events")
    .update({ orchestration_completed_at: new Date().toISOString() })
    .eq("id", eventId);
  throwIfError(error, "mark Telegram orchestration completed");
}

export async function updateTelegramOutboundState(args: {
  eventId: string;
  outboundStatus: TelegramOutboundStatus;
  outboundMessageId?: string | null;
}): Promise<void> {
  const client = getClient();
  const update: Record<string, unknown> = { outbound_status: args.outboundStatus };
  if (args.outboundMessageId !== undefined) {
    update.outbound_message_id = args.outboundMessageId;
  }
  const { error } = await client
    .from("telegram_webhook_events")
    .update(update)
    .eq("id", args.eventId);
  throwIfError(error, "update Telegram outbound state");
}

export async function markTelegramEventProcessed(eventId: string): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("telegram_webhook_events")
    .update({
      status: "processed",
      processed_at: new Date().toISOString(),
      last_error: null,
    })
    .eq("id", eventId);
  throwIfError(error, "mark Telegram event processed");
}

export async function markTelegramEventFailed(args: {
  eventId: string;
  error: unknown;
  outboundStatus?: TelegramOutboundStatus;
}): Promise<void> {
  const client = getClient();
  const update: {
    status: TelegramWebhookEventStatus;
    last_error: string;
    outbound_status?: TelegramOutboundStatus;
  } = {
    status: "failed",
    last_error: sanitizeStoredError(args.error),
  };
  if (args.outboundStatus) update.outbound_status = args.outboundStatus;

  const { error } = await client
    .from("telegram_webhook_events")
    .update(update)
    .eq("id", args.eventId);
  throwIfError(error, "mark Telegram event failed");
}
