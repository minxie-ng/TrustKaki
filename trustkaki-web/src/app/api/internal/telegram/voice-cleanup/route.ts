import { NextResponse } from "next/server";
import { expireVoiceDrafts } from "@/lib/persistence/telegramVoiceRepository";
import { verifyTelegramWebhookSecret } from "@/lib/telegram/webhookAuth";
export const runtime = "nodejs";
export async function GET(request: Request) {
  const secret=process.env.CRON_SECRET;
  if(!secret) return NextResponse.json({status:"not_found"},{status:404});
  const header=request.headers.get("authorization");
  const token=header?.startsWith("Bearer ") ? header.slice(7) : null;
  if(!verifyTelegramWebhookSecret({configuredSecret:secret,headerValue:token})) return NextResponse.json({status:"unauthorized"},{status:401});
  try {
    await expireVoiceDrafts();
    return NextResponse.json({status:"completed"});
  } catch {return NextResponse.json({status:"cleanup_failed"},{status:503});}
}
