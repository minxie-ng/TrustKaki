import { NextResponse } from "next/server";

const SENSITIVE_ENV_KEYS = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "TRUSTKAKI_LLM_API_KEY",
  "WHATSAPP_ACCESS_TOKEN",
  "WHATSAPP_VERIFY_TOKEN",
  "META_APP_SECRET",
  "WHATSAPP_INTERNAL_PROCESSOR_SECRET",
];

function rawErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "Unknown error";
}

export function redactSensitiveText(value: string): string {
  let redacted = value;

  for (const key of SENSITIVE_ENV_KEYS) {
    redacted = redacted.replaceAll(key, "[secret]");
    const secretValue = process.env[key];
    if (secretValue) {
      redacted = redacted.split(secretValue).join("[redacted]");
    }
  }

  return redacted
    .replace(/bearer\s+[^\s,;]+/gi, "bearer [redacted]")
    .replace(/\btoken\s+[^\s,;]+/gi, "token [redacted]")
    .replace(/\bsk-[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\+?\d[\d\s().-]{7,}\d/g, "[phone]")
    .slice(0, 240);
}

export function jsonError(
  publicMessage = "Unable to complete the request",
  options: {
    error?: unknown;
    status?: number;
  } = {}
) {
  const status = options.status ?? 500;
  const body: { error: string; detail?: string } = { error: publicMessage };

  if (process.env.NODE_ENV !== "production" && options.error !== undefined) {
    body.detail = redactSensitiveText(rawErrorMessage(options.error));
  }

  return NextResponse.json(body, { status });
}
