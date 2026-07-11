import "server-only";

import type { WhatsAppSendTextResult } from "./types";

export interface WhatsAppClientConfig {
  accessToken: string;
  phoneNumberId: string;
  graphApiVersion: string;
}

export interface SendWhatsAppTextParams {
  to: string;
  text: string;
  phoneNumberId?: string;
}

export interface WhatsAppOutboundClient {
  sendText(params: SendWhatsAppTextParams): Promise<WhatsAppSendTextResult>;
  sendTemplate?: (params: never) => Promise<never>;
}

export function getWhatsAppClientConfig(): WhatsAppClientConfig | null {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const graphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION ?? "v23.0";

  if (!accessToken || !phoneNumberId) return null;
  return { accessToken, phoneNumberId, graphApiVersion };
}

export function buildWhatsAppTextRequest(
  config: WhatsAppClientConfig,
  params: SendWhatsAppTextParams
): { url: string; init: RequestInit; body: Record<string, unknown> } {
  const phoneNumberId = params.phoneNumberId ?? config.phoneNumberId;
  const body = {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: params.to,
    type: "text",
    text: {
      preview_url: false,
      body: params.text,
    },
  };

  return {
    url: `https://graph.facebook.com/${config.graphApiVersion}/${phoneNumberId}/messages`,
    init: {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    },
    body,
  };
}

export async function sendWhatsAppText(
  params: SendWhatsAppTextParams
): Promise<WhatsAppSendTextResult> {
  const config = getWhatsAppClientConfig();
  if (!config) {
    throw new Error("WhatsApp Cloud API env vars are not configured");
  }

  const request = buildWhatsAppTextRequest(config, params);
  const response = await fetch(request.url, request.init);
  const json = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`WhatsApp send failed with HTTP ${response.status}`);
  }

  const messageId =
    typeof json === "object" &&
    json !== null &&
    Array.isArray((json as { messages?: unknown }).messages) &&
    typeof (json as { messages: Array<{ id?: unknown }> }).messages[0]?.id === "string"
      ? (json as { messages: Array<{ id: string }> }).messages[0].id
      : "";

  if (!messageId) {
    throw new Error("WhatsApp send response did not include a message ID");
  }

  return { messageId, raw: json };
}

export const whatsAppOutboundClient: WhatsAppOutboundClient = {
  sendText: sendWhatsAppText,
};
