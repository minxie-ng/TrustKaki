import "server-only";

const SECRET_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~-]+/gi,
  /(access_token=)[^&\s]+/gi,
  /(verify_token=)[^&\s]+/gi,
  /(app_secret=)[^&\s]+/gi,
];

export function maskPhoneNumber(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length <= 4) return "****";
  return `${"*".repeat(Math.max(4, digits.length - 4))}${digits.slice(-4)}`;
}

export function sanitizeErrorMessage(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return SECRET_PATTERNS.reduce(
    (message, pattern) => message.replace(pattern, "$1[redacted]"),
    raw
  ).slice(0, 500);
}

export function logWhatsAppError(message: string, error: unknown): void {
  console.error(`[TrustKaki:whatsapp] ${message}: ${sanitizeErrorMessage(error)}`);
}
