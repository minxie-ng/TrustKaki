import { normalizePhoneNumber } from "@/lib/phone";
import type { WhatsAppInboundTextMessage, WhatsAppParsedWebhookEvent } from "./types";

interface MetaTextMessage {
  id?: unknown;
  from?: unknown;
  timestamp?: unknown;
  type?: unknown;
  text?: {
    body?: unknown;
  };
}

interface MetaStatus {
  id?: unknown;
  recipient_id?: unknown;
  status?: unknown;
  timestamp?: unknown;
}

interface MetaChangeValue {
  metadata?: {
    phone_number_id?: unknown;
  };
  messages?: MetaTextMessage[];
  statuses?: MetaStatus[];
}

interface MetaWebhookPayload {
  entry?: Array<{
    changes?: Array<{
      value?: MetaChangeValue;
    }>;
  }>;
}

function timestampToIso(timestamp: unknown): string {
  const seconds = typeof timestamp === "string" ? Number(timestamp) : Number.NaN;
  if (!Number.isFinite(seconds) || seconds <= 0) return new Date().toISOString();
  return new Date(seconds * 1000).toISOString();
}

export function parseInboundTextMessages(payload: unknown): WhatsAppInboundTextMessage[] {
  return parseWhatsAppWebhookEvents(payload).flatMap((event) =>
    event.eventType === "inbound_text"
      ? [
          {
            id: event.whatsappMessageId,
            from: event.senderPhoneE164,
            timestamp: event.timestamp,
            text: event.text,
            phoneNumberId: event.phoneNumberId,
          },
        ]
      : []
  );
}

function compactPayload(value: Record<string, unknown>): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function parseStatusEvent(args: {
  status: MetaStatus;
  phoneNumberId: string | null;
}): WhatsAppParsedWebhookEvent | null {
  if (
    typeof args.status.id !== "string" ||
    typeof args.status.status !== "string" ||
    !["sent", "delivered", "read", "failed"].includes(args.status.status)
  ) {
    return null;
  }

  const timestamp = timestampToIso(args.status.timestamp);
  const recipient =
    typeof args.status.recipient_id === "string"
      ? normalizePhoneNumber(args.status.recipient_id)
      : null;
  const status = args.status.status as "sent" | "delivered" | "read" | "failed";
  const eventType = `status_${status}` as
    | "status_sent"
    | "status_delivered"
    | "status_read"
    | "status_failed";

  return {
    eventType,
    whatsappMessageId: `status:${args.status.id}:${status}:${timestamp}`,
    phoneNumberId: args.phoneNumberId,
    senderPhoneE164: recipient,
    relatedWhatsAppMessageId: args.status.id,
    timestamp,
    status,
    payload: compactPayload(args.status as Record<string, unknown>),
  };
}

export function parseWhatsAppWebhookEvents(
  payload: unknown
): WhatsAppParsedWebhookEvent[] {
  const parsed = payload as MetaWebhookPayload;
  const events: WhatsAppParsedWebhookEvent[] = [];

  for (const entry of parsed.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      const normalizedPhoneNumberId =
        typeof phoneNumberId === "string" ? phoneNumberId : null;

      for (const message of value?.messages ?? []) {
        if (
          typeof message.id !== "string" ||
          typeof message.from !== "string" ||
          message.type !== "text" ||
          typeof message.text?.body !== "string" ||
          !normalizedPhoneNumberId
        ) {
          continue;
        }

        const from = normalizePhoneNumber(message.from);
        if (!from) continue;

        events.push({
          eventType: "inbound_text",
          whatsappMessageId: message.id,
          senderPhoneE164: from,
          timestamp: timestampToIso(message.timestamp),
          text: message.text.body,
          phoneNumberId: normalizedPhoneNumberId,
          payload: compactPayload(message as Record<string, unknown>),
        });
      }

      for (const status of value?.statuses ?? []) {
        const event = parseStatusEvent({
          status,
          phoneNumberId: normalizedPhoneNumberId,
        });
        if (event) events.push(event);
      }
    }
  }

  return events;
}

export function buildMetaTextWebhookFixture(args: {
  messageId: string;
  from: string;
  phoneNumberId: string;
  text: string;
  timestamp?: string;
}): MetaWebhookPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: args.phoneNumberId,
              },
              messages: [
                {
                  id: args.messageId,
                  from: args.from,
                  timestamp: args.timestamp ?? String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: {
                    body: args.text,
                  },
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

export function buildMetaStatusWebhookFixture(args: {
  messageId: string;
  recipientId: string;
  phoneNumberId: string;
  status: "sent" | "delivered" | "read" | "failed";
  timestamp?: string;
}): MetaWebhookPayload {
  return {
    entry: [
      {
        changes: [
          {
            value: {
              metadata: {
                phone_number_id: args.phoneNumberId,
              },
              statuses: [
                {
                  id: args.messageId,
                  recipient_id: args.recipientId,
                  status: args.status,
                  timestamp: args.timestamp ?? String(Math.floor(Date.now() / 1000)),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
