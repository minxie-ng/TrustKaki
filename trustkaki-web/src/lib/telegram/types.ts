export interface TelegramInboundText {
  updateId: string;
  messageId: string;
  senderUserId: string;
  chatId: string;
  timestamp: string;
  text: string;
}

export interface TelegramClientConfig {
  botToken: string;
  timeoutMs: number;
}

export interface SendTelegramTextParams {
  chatId: string;
  text: string;
  replyMarkup?: { inline_keyboard: { text: string; callback_data: string }[][] };
}

export interface TelegramSendTextResult {
  messageId: string;
}

export interface TelegramOutboundClient {
  sendText(params: SendTelegramTextParams): Promise<TelegramSendTextResult>;
  answerCallback?(callbackId: string): Promise<void>;
}
