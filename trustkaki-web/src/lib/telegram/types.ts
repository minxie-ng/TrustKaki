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
}

export interface TelegramSendTextResult {
  messageId: string;
}

export interface TelegramOutboundClient {
  sendText(params: SendTelegramTextParams): Promise<TelegramSendTextResult>;
}
