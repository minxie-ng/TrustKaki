import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type {
  Database,
  Json,
  WhatsAppOutboundStatus,
  WhatsAppWebhookEventStatus,
} from "@/lib/supabase/types";
import type { AgentId } from "@/lib/types";
import type { AgentRunContext, OrchestrateResponse } from "@/lib/agents/contracts";
import type { WhatsAppParsedWebhookEvent } from "@/lib/whatsapp/types";
import { sanitizeErrorMessage } from "@/lib/whatsapp/logging";

type TrustKakiClient = SupabaseClient;
type WhatsAppEventRow = Database["public"]["Tables"]["whatsapp_webhook_events"]["Row"];
type WhatsAppEventInsert =
  Database["public"]["Tables"]["whatsapp_webhook_events"]["Insert"];

export type PersistedWhatsAppEvent = WhatsAppEventRow;

export interface AcceptedWhatsAppEvent {
  row: WhatsAppEventRow;
  duplicate: boolean;
}

function getClient(): TrustKakiClient {
  const client = createTrustKakiServiceClient();
  if (!client) {
    throw new Error("Supabase is not configured for durable WhatsApp webhook events");
  }
  return client;
}

function throwIfError(error: { message: string } | null, operation: string): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

function isDuplicateError(error: { code?: string } | null): boolean {
  return error?.code === "23505";
}

function toInsert(event: WhatsAppParsedWebhookEvent): WhatsAppEventInsert {
  if (event.eventType === "inbound_text") {
    return {
      whatsapp_message_id: event.whatsappMessageId,
      event_type: "inbound_text",
      phone_number_id: event.phoneNumberId,
      sender_phone_e164: event.senderPhoneE164,
      payload: event.payload as Json,
      status: "received",
      outbound_status: "not_started",
    };
  }

  return {
    whatsapp_message_id: event.whatsappMessageId,
    event_type: event.eventType,
    phone_number_id: event.phoneNumberId,
    sender_phone_e164: event.senderPhoneE164,
    related_whatsapp_message_id: event.relatedWhatsAppMessageId,
    payload: event.payload as Json,
    status: "ignored",
    outbound_status: "not_started",
  };
}

export async function acceptWhatsAppEvent(
  event: WhatsAppParsedWebhookEvent
): Promise<AcceptedWhatsAppEvent> {
  const client = getClient();
  const insert = toInsert(event);
  const { data, error } = await client
    .from("whatsapp_webhook_events")
    .insert(insert)
    .select("*")
    .single();

  if (!error && data) return { row: data, duplicate: false };
  if (!isDuplicateError(error)) throwIfError(error, "insert WhatsApp webhook event");

  const { data: existing, error: selectError } = await client
    .from("whatsapp_webhook_events")
    .select("*")
    .eq("whatsapp_message_id", event.whatsappMessageId)
    .single();
  throwIfError(selectError, "select duplicate WhatsApp webhook event");
  return { row: existing, duplicate: true };
}

export async function claimWhatsAppEvent(
  eventId: string
): Promise<WhatsAppEventRow | null> {
  const client = getClient();
  const { data, error } = await client.rpc("claim_whatsapp_webhook_event", {
    p_event_id: eventId,
  });
  throwIfError(error, "claim WhatsApp webhook event");
  return data?.[0] ?? null;
}

export async function listRetryableWhatsAppEvents(
  limit: number
): Promise<WhatsAppEventRow[]> {
  const client = getClient();
  const boundedLimit = Math.max(1, Math.min(limit, 25));
  const { data, error } = await client
    .from("whatsapp_webhook_events")
    .select("*")
    .in("status", ["received", "failed"])
    .order("received_at", { ascending: true })
    .limit(boundedLimit);
  throwIfError(error, "list retryable WhatsApp webhook events");
  return data ?? [];
}

export async function storeWhatsAppOrchestrationResult(args: {
  eventId: string;
  context: AgentRunContext;
  result: OrchestrateResponse;
  selectedReplyText: string | null;
  selectedReplyAgentId: AgentId | null;
  selectedReplyClientMessageId: string | null;
}): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("whatsapp_webhook_events")
    .update({
      orchestration_result: args.result as unknown as Json,
      orchestration_context: args.context as unknown as Json,
      selected_reply_text: args.selectedReplyText,
      selected_reply_agent_id: args.selectedReplyAgentId,
      selected_reply_client_message_id: args.selectedReplyClientMessageId,
      outbound_status: args.selectedReplyText ? "pending" : "not_started",
    })
    .eq("id", args.eventId);
  throwIfError(error, "store WhatsApp orchestration result");
}

export async function markWhatsAppOrchestrationCompleted(
  eventId: string
): Promise<void> {
  const client = getClient();
  const { error } = await client
    .from("whatsapp_webhook_events")
    .update({ orchestration_completed_at: new Date().toISOString() })
    .eq("id", eventId);
  throwIfError(error, "mark WhatsApp orchestration completed");
}

export async function updateWhatsAppOutboundState(args: {
  eventId: string;
  outboundStatus: WhatsAppOutboundStatus;
  outboundMessageId?: string | null;
}): Promise<void> {
  const client = getClient();
  const update: Database["public"]["Tables"]["whatsapp_webhook_events"]["Update"] = {
    outbound_status: args.outboundStatus,
  };
  if (args.outboundMessageId !== undefined) {
    update.outbound_message_id = args.outboundMessageId;
  }
  const { error } = await client
    .from("whatsapp_webhook_events")
    .update(update)
    .eq("id", args.eventId);
  throwIfError(error, "update WhatsApp outbound state");
}

export async function markWhatsAppEventProcessed(eventId: string): Promise<void> {
  const client = getClient();
  const now = new Date().toISOString();
  const { error } = await client
    .from("whatsapp_webhook_events")
    .update({
      status: "processed",
      processed_at: now,
      last_error: null,
    })
    .eq("id", eventId);
  throwIfError(error, "mark WhatsApp event processed");
}

export async function markWhatsAppEventFailed(args: {
  eventId: string;
  error: unknown;
  outboundStatus?: WhatsAppOutboundStatus;
}): Promise<void> {
  const client = getClient();
  const update: {
    status: WhatsAppWebhookEventStatus;
    last_error: string;
    outbound_status?: WhatsAppOutboundStatus;
  } = {
    status: "failed",
    last_error: sanitizeErrorMessage(args.error),
  };
  if (args.outboundStatus) update.outbound_status = args.outboundStatus;

  const { error } = await client
    .from("whatsapp_webhook_events")
    .update(update)
    .eq("id", args.eventId);
  throwIfError(error, "mark WhatsApp event failed");
}
