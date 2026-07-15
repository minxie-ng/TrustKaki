import { NextRequest, NextResponse } from "next/server";
import { logTelegramError } from "@/lib/telegram/logging";
import { retryPendingTelegramEvents } from "@/lib/telegram/service";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/webhookAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.toLowerCase().startsWith("bearer ")) return null;
  const token = header.slice("bearer ".length).trim();
  return token || null;
}

function boundedLimit(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 5;
  return Math.min(25, Math.max(1, Math.floor(value)));
}

export async function POST(request: NextRequest) {
  const configuredSecret = process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET;
  if (!configuredSecret) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const authorized = verifyTelegramWebhookSecret({
    configuredSecret,
    headerValue: bearerToken(request),
  });
  if (!authorized) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
    const limit = boundedLimit(body.limit);
    const result = await retryPendingTelegramEvents({ limit });

    return NextResponse.json({
      status: "processed",
      limit,
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
      statuses: result.statuses,
    });
  } catch (error) {
    logTelegramError({ category: "retry-processing-failed", error });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
