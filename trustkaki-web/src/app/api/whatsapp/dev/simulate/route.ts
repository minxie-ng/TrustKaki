import { NextRequest, NextResponse } from "next/server";
import { buildMetaTextWebhookFixture } from "@/lib/whatsapp/parser";
import {
  acceptWhatsAppWebhookEvent,
  processWhatsAppEventById,
} from "@/lib/whatsapp/service";
import { logWhatsAppError } from "@/lib/whatsapp/logging";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not available in production" }, { status: 404 });
  }
  if (process.env.ENABLE_WHATSAPP_DEV_SIMULATOR !== "true") {
    return NextResponse.json({ error: "Simulator disabled" }, { status: 404 });
  }

  try {
    const body = (await request.json()) as {
      messageId?: string;
      from?: string;
      text?: string;
      phoneNumberId?: string;
      timestamp?: string;
    };

    if (!body.messageId || !body.from || !body.text) {
      return NextResponse.json(
        { error: "messageId, from, and text are required" },
        { status: 400 }
      );
    }

    const payload = buildMetaTextWebhookFixture({
      messageId: body.messageId,
      from: body.from,
      text: body.text,
      phoneNumberId:
        body.phoneNumberId ?? process.env.WHATSAPP_PHONE_NUMBER_ID ?? "dev_phone_number_id",
      timestamp: body.timestamp,
    });

    const accepted = await acceptWhatsAppWebhookEvent(payload);
    const event = accepted.events.find((item) => item.eventType === "inbound_text");
    if (!event) {
      return NextResponse.json({
        status: "accepted",
        result: accepted.status,
        accepted: accepted.events.length,
      });
    }

    const result = event.duplicate
      ? {
          status: "duplicate" as const,
          inboundMessageId: event.whatsappMessageId,
        }
      : await processWhatsAppEventById(event.eventId, {
          sendText: async () => ({
            messageId: `dev_${body.messageId}`,
            raw: { simulated: true },
          }),
        });

    return NextResponse.json({
      status: "accepted",
      result: result.status,
      inboundMessageId: result.inboundMessageId,
      outboundMessageId: result.outboundMessageId,
    });
  } catch (error) {
    logWhatsAppError("WhatsApp dev simulation failed", error);
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}
