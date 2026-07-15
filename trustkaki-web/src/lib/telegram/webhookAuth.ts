import { createHash, timingSafeEqual } from "node:crypto";

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

export function verifyTelegramWebhookSecret(args: {
  configuredSecret?: string;
  headerValue: string | null;
}): boolean {
  if (!args.configuredSecret || !args.headerValue) return false;
  return timingSafeEqual(digest(args.configuredSecret), digest(args.headerValue));
}
