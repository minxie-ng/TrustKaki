import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import { logTelegramError } from "@/lib/telegram/logging";
import {
  acceptTelegramWebhookEvent,
  processTelegramEventById,
} from "@/lib/telegram/service";
import type { TelegramOutboundClient } from "@/lib/telegram/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const simulationSchema = z.object({
  updateId: z.number().int().safe().nonnegative(),
  messageId: z.number().int().safe().positive(),
  senderUserId: z.number().int().safe().positive(),
  chatId: z.number().int().safe(),
  timestamp: z.number().int().safe().nonnegative().optional(),
  text: z.string().trim().min(1).max(4096),
});

interface SafeOutboundRequestBody {
  chat_id: "[redacted]";
  text: string;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  if (process.env.ENABLE_TELEGRAM_DEV_SIMULATOR !== "true") {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }

  const authResult = await requireDemoAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);

  try {
    const parsed = simulationSchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid simulation input" }, { status: 400 });
    }

    const input = parsed.data;
    const payload = {
      update_id: input.updateId,
      message: {
        message_id: input.messageId,
        date: input.timestamp ?? Math.floor(Date.now() / 1000),
        from: {
          id: input.senderUserId,
          is_bot: false as const,
          first_name: "Demo senior",
        },
        chat: {
          id: input.chatId,
          type: "private" as const,
        },
        text: input.text,
      },
    };

    const accepted = await acceptTelegramWebhookEvent(payload);
    if (accepted.status === "ignored") {
      return NextResponse.json({
        status: "accepted",
        result: "ignored",
        persisted: false,
        outboundRequestCount: 0,
      });
    }
    if (accepted.status === "duplicate" || !accepted.eventId) {
      return NextResponse.json({
        status: "accepted",
        result: "duplicate",
        persisted: true,
        outboundRequestCount: 0,
      });
    }

    const outboundRequests: SafeOutboundRequestBody[] = [];
    const outboundClient: TelegramOutboundClient = {
      async sendText({ text }) {
        outboundRequests.push({ chat_id: "[redacted]", text });
        return { messageId: "1" };
      },
    };
    const result = await processTelegramEventById(accepted.eventId, {
      outboundClient,
    });

    return NextResponse.json({
      status: "accepted",
      result: result.status,
      persisted: true,
      outboundRequestCount: outboundRequests.length,
      ...(outboundRequests[0]
        ? { outboundRequestBody: outboundRequests[0] }
        : {}),
    });
  } catch (error) {
    logTelegramError({ category: "dev-simulation-failed", error });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
