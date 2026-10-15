import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processPendingMemory } from "@/lib/memory/indexWorker";

export const runtime = "nodejs";
export const maxDuration = 60;
const digest = (text: string) => createHash("sha256").update(text).digest();
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || process.env.TRUSTKAKI_PERSONAL_MEMORY_BACKEND !== "neon") return json({ status: "not_found" }, 404);
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || !timingSafeEqual(digest(secret), digest(header.slice(7)))) {
    return json({ status: "unauthorized" }, 401);
  }
  try {
    const result = await processPendingMemory(AbortSignal.timeout(40000));
    return json({ status: "processed", limit: 10, ...result });
  } catch {
    return json({ status: "error" }, 500);
  }
}
export const POST = GET;
