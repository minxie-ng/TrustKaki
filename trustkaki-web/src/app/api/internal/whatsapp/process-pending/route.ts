import { NextRequest, NextResponse } from "next/server";
import { retryPendingWhatsAppEvents } from "@/lib/whatsapp/service";
import { logWhatsAppError } from "@/lib/whatsapp/logging";

export const maxDuration = 60;

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function POST(request: NextRequest) {
  if (!process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as { limit?: unknown };
    const limit =
      typeof body.limit === "number" && Number.isFinite(body.limit)
        ? Math.max(1, Math.min(Math.floor(body.limit), 25))
        : 5;
    const result = await retryPendingWhatsAppEvents({ limit });
    return NextResponse.json({
      status: "processed",
      limit,
      processed: result.processed,
      failed: result.failed,
      skipped: result.skipped,
      statuses: result.statuses,
    });
  } catch (error) {
    logWhatsAppError("WhatsApp pending processor failed", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
