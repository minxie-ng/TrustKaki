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

async function processPending(args: {
  request: NextRequest;
  configuredSecret: string | undefined;
  limit: number;
}) {
  if (!args.configuredSecret) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const authorized = verifyTelegramWebhookSecret({
    configuredSecret: args.configuredSecret,
    headerValue: bearerToken(args.request),
  });
  if (!authorized) {
    return NextResponse.json({ status: "unauthorized" }, { status: 401 });
  }

  try {
    const result = await retryPendingTelegramEvents({ limit: args.limit });
    return NextResponse.json({
      status: "processed",
      limit: args.limit,
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

export async function GET(request: NextRequest) {
  return processPending({
    request,
    configuredSecret: process.env.CRON_SECRET,
    limit: 10,
  });
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
  return processPending({
    request,
    configuredSecret: process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET,
    limit: boundedLimit(body.limit),
  });
}
