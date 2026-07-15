import { telegramPrivateTextUpdateSchema } from "./schemas";
import type { TelegramInboundText } from "./types";

export function parseTelegramInboundText(
  payload: unknown
): TelegramInboundText | null {
  const parsed = telegramPrivateTextUpdateSchema.safeParse(payload);
  if (!parsed.success || !parsed.data.message.text.trim()) return null;

  const { update_id: updateId, message } = parsed.data;
  return {
    updateId: String(updateId),
    messageId: String(message.message_id),
    senderUserId: String(message.from.id),
    chatId: String(message.chat.id),
    timestamp: new Date(message.date * 1000).toISOString(),
    text: message.text,
  };
}
