import "server-only";

import { telegramSendMessageResponseSchema } from "./schemas";
import type {
  SendTelegramTextParams,
  TelegramClientConfig,
  TelegramOutboundClient,
  TelegramSendTextResult,
} from "./types";

type FetchImplementation = (
  input: string | URL | Request,
  init?: RequestInit
) => Promise<Response>;

const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

function parseTimeout(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return DEFAULT_TIMEOUT_MS;
  return Math.min(Math.trunc(parsed), MAX_TIMEOUT_MS);
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === "TimeoutError" || error.name === "AbortError")
  );
}

export function getTelegramClientConfig(): TelegramClientConfig | null {
  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  if (!botToken) return null;
  return {
    botToken,
    timeoutMs: parseTimeout(process.env.TELEGRAM_API_TIMEOUT_MS),
  };
}

export function buildTelegramTextRequest(
  config: TelegramClientConfig,
  params: SendTelegramTextParams
): { url: string; init: RequestInit; body: Record<string, string> } {
  const body = {
    chat_id: params.chatId,
    text: params.text,
  };

  return {
    url: `https://api.telegram.org/bot${config.botToken}/sendMessage`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.timeoutMs),
    },
    body,
  };
}

export async function sendTelegramTextWithConfig(
  config: TelegramClientConfig,
  params: SendTelegramTextParams,
  fetchImpl: FetchImplementation = fetch
): Promise<TelegramSendTextResult> {
  const request = buildTelegramTextRequest(config, params);
  let response: Response;

  try {
    response = await fetchImpl(request.url, request.init);
  } catch (error) {
    if (isTimeoutError(error)) throw new Error("Telegram send timed out");
    throw new Error("Telegram send failed");
  }

  if (!response.ok) {
    throw new Error(`Telegram send failed with HTTP ${response.status}`);
  }

  const json = await response.json().catch(() => null);
  const parsed = telegramSendMessageResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new Error("Telegram send response was invalid");
  }

  return { messageId: String(parsed.data.result.message_id) };
}

export async function sendTelegramText(
  params: SendTelegramTextParams
): Promise<TelegramSendTextResult> {
  const config = getTelegramClientConfig();
  if (!config) throw new Error("Telegram Bot API is not configured");
  return sendTelegramTextWithConfig(config, params);
}

export const telegramOutboundClient: TelegramOutboundClient = {
  sendText: sendTelegramText,
};
