import { after, NextRequest, NextResponse } from "next/server";
import { logTelegramError } from "@/lib/telegram/logging";
import {
  acceptTelegramWebhookEvent,
  processTelegramEventById,
} from "@/lib/telegram/service";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/webhookAuth";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authenticated = verifyTelegramWebhookSecret({
    configuredSecret: process.env.TELEGRAM_WEBHOOK_SECRET,
    headerValue: request.headers.get("x-telegram-bot-api-secret-token"),
  });
  if (!authenticated) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }

  try {
    const payload: unknown = await request.json();
    const accepted = await acceptTelegramWebhookEvent(payload);
    const shouldProcess = accepted.status === "accepted" && Boolean(accepted.eventId);

    if (shouldProcess && accepted.eventId) {
      const eventId = accepted.eventId;
      after(async () => {
        try {
          await processTelegramEventById(eventId);
        } catch (error) {
          logTelegramError({
            category: "after-processing-failed",
            eventId,
            error,
          });
        }
      });
    }

    return NextResponse.json({
      status: "accepted",
      result: accepted.status,
      scheduled: shouldProcess,
    });
  } catch (error) {
    logTelegramError({ category: "webhook-acceptance-failed", error });
    return NextResponse.json(
      { status: "retryable_error", result: "not_accepted" },
      { status: 503 }
    );
  }
}
