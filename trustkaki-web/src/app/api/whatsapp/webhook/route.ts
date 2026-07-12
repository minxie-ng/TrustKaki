import { after, NextRequest, NextResponse } from "next/server";
import {
  acceptWhatsAppWebhookEvent,
  processWhatsAppEventById,
} from "@/lib/whatsapp/service";
import { logWhatsAppError } from "@/lib/whatsapp/logging";
import { verifyMetaSignature } from "@/lib/whatsapp/signature";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const mode = searchParams.get("hub.mode");
  const verifyToken = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (
    mode === "subscribe" &&
    challenge &&
    verifyToken === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signatureState = verifyMetaSignature({
    rawBody,
    signatureHeader: request.headers.get("x-hub-signature-256"),
    appSecret: process.env.META_APP_SECRET,
  });

  if (signatureState === "invalid") {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }

  try {
    const payload = JSON.parse(rawBody);
    const result = await acceptWhatsAppWebhookEvent(payload);
    const processableEventIds = result.events
      .filter((event) => event.processable)
      .map((event) => event.eventId);

    for (const eventId of processableEventIds) {
      after(async () => {
        try {
          await processWhatsAppEventById(eventId);
        } catch (error) {
          logWhatsAppError("scheduled WhatsApp event processing failed", error);
        }
      });
    }

    return NextResponse.json({
      status: "accepted",
      result: result.status,
      accepted: result.events.length,
      scheduled: processableEventIds.length,
      signature: signatureState === "pending" ? "pending" : "verified",
    });
  } catch (error) {
    logWhatsAppError("WhatsApp webhook acceptance failed", error);
    return NextResponse.json(
      { status: "retryable_error", result: "not_accepted" },
      { status: 503 }
    );
  }
}
