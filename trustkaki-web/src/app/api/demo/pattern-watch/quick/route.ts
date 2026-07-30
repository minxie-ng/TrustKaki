import { NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import { readDashboardState } from "@/lib/persistence/trustkakiRepository";
import { prepareLiveDemoPersistence } from "@/lib/persistence/demoRepository";
import { DEMO_SENIOR_ID } from "@/lib/persistence/orchestration";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const authResult = await requireDemoAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "demo:quick",
    limit: 5,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many requests", retryAfterSeconds: rateLimit.retryAfterSeconds },
      {
        status: 429,
        headers: { "Retry-After": String(rateLimit.retryAfterSeconds) },
      }
    );
  }

  const startedAt = Date.now();
  try {
    const preparation = await prepareLiveDemoPersistence({
      accessToken: authResult.accessToken,
    });

    const state = await readDashboardState({
      auth: authResult.auth,
      seniorId: DEMO_SENIOR_ID,
    });
    return NextResponse.json({
      status: "ok",
      demo: "quick",
      scenario: "4-day mobility, appetite, and withdrawal pattern",
      messagesRun: 4,
      signalsDetected: 4,
      queueCount: state.data.followUpQueue.length,
      queue: state.data.followUpQueue,
      data: state.data,
      durationMs: Date.now() - startedAt,
      fixture: preparation.fixture,
      persistence: preparation.persistence,
    });
  } catch (error) {
    return jsonError("Failed to run quick Pattern Watch demo", {
      error,
      status: 500,
    });
  }
}
