import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { processDueProactiveJobs } from "@/lib/checkins/service";
import { retryPendingTelegramEvents } from "@/lib/telegram/service";

export const runtime = "nodejs";
export const maxDuration = 60;

const PROCESS_LIMIT = 10;

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

function isAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || !authorization?.startsWith("Bearer ")) return false;
  return timingSafeEqual(digest(secret), digest(authorization.slice(7)));
}

async function processRequest(request: NextRequest) {
  if (!process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Not available" }, { status: 404 });
  }
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    await retryPendingTelegramEvents({ limit: PROCESS_LIMIT });
    const result = await processDueProactiveJobs({
      limit: PROCESS_LIMIT,
      workerId: `check-in-${randomUUID()}`,
      now: new Date().toISOString(),
    });
    return NextResponse.json({ status: "processed", ...result });
  } catch {
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return processRequest(request);
}

export async function POST(request: NextRequest) {
  return processRequest(request);
}
