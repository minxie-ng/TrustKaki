import "server-only";

const TELEGRAM_TOKEN_PATTERN = /bot\d+:[A-Za-z0-9_-]+/gi;
const LONG_NUMERIC_ID_PATTERN = /(?<!\d)-?\d{7,}(?!\d)/g;

export function sanitizeTelegramError(error: unknown): string {
  let message = error instanceof Error ? error.message : String(error);
  const configuredToken = process.env.TELEGRAM_BOT_TOKEN;
  if (configuredToken) message = message.split(configuredToken).join("[redacted]");

  return message
    .replace(TELEGRAM_TOKEN_PATTERN, "bot[redacted]")
    .replace(LONG_NUMERIC_ID_PATTERN, "[id-redacted]")
    .slice(0, 500);
}

export function logTelegramError(args: {
  category: string;
  error: unknown;
  eventId?: string;
}): void {
  const category = args.category.replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
  const eventId = args.eventId?.replace(/[^a-z0-9-]/gi, "").slice(0, 40);
  const context = eventId ? ` event=${eventId}` : "";
  console.error(
    `[TrustKaki:telegram] ${category}${context}: ${sanitizeTelegramError(args.error)}`
  );
}
