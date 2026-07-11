export interface WhatsAppInboundTextMessage {
  id: string;
  from: string;
  timestamp: string;
  text: string;
  phoneNumberId: string;
}

export type WhatsAppParsedWebhookEvent =
  | {
      eventType: "inbound_text";
      whatsappMessageId: string;
      phoneNumberId: string;
      senderPhoneE164: string;
      timestamp: string;
      text: string;
      payload: Record<string, unknown>;
    }
  | {
      eventType: "status_sent" | "status_delivered" | "status_read" | "status_failed";
      whatsappMessageId: string;
      phoneNumberId: string | null;
      senderPhoneE164: string | null;
      relatedWhatsAppMessageId: string;
      timestamp: string;
      status: "sent" | "delivered" | "read" | "failed";
      payload: Record<string, unknown>;
    };

export interface WhatsAppAcceptedEvent {
  eventId: string;
  whatsappMessageId: string;
  eventType: WhatsAppParsedWebhookEvent["eventType"] | "unsupported";
  duplicate: boolean;
  processable: boolean;
}

export interface WhatsAppAcceptResult {
  status: "accepted" | "duplicate" | "ignored";
  events: WhatsAppAcceptedEvent[];
  reason?: string;
}

export interface WhatsAppProcessResult {
  status:
    | "processed"
    | "duplicate"
    | "ignored"
    | "claimed_elsewhere"
    | "senior_not_found"
    | "signature_pending"
    | "signature_invalid"
    | "error";
  inboundMessageId?: string;
  outboundMessageId?: string;
  reason?: string;
}

export interface WhatsAppSendTextResult {
  messageId: string;
  raw: unknown;
}
