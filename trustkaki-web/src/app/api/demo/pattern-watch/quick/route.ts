import { NextResponse } from "next/server";
import { uncleTan } from "@/data/demo";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import { runTriageTimelineAgent } from "@/lib/agents/orchestrator";
import {
  persistQuickDemoTimelineResult,
  readDemoDashboardState,
  resetDemoPersistence,
} from "@/lib/persistence/trustkakiRepository";
import { DEMO_SENIOR_ID } from "@/lib/persistence/orchestration";
import type { AgentRunContext } from "@/lib/agents/contracts";
import type { Message, RiskLevel } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const SCENARIO = [
  {
    id: "quick_pattern_demo_day_1",
    text: "My knee pain today. Walking feels uncomfortable.",
    timestamp: "2026-07-07T08:00:00.000Z",
  },
  {
    id: "quick_pattern_demo_day_2",
    text: "Not hungry today. I skipped breakfast.",
    timestamp: "2026-07-08T08:00:00.000Z",
  },
  {
    id: "quick_pattern_demo_day_3",
    text: "I avoid going downstairs. Staying home because my leg is stiff.",
    timestamp: "2026-07-09T08:00:00.000Z",
  },
  {
    id: "quick_pattern_demo_day_4",
    text: "Missed usual check-in. Don't want to join lunch, paiseh.",
    timestamp: "2026-07-10T08:00:00.000Z",
  },
];

function contextFor(index: number, currentRiskLevel: RiskLevel): AgentRunContext {
  const messages: Message[] = SCENARIO.slice(0, index + 1).map((item) => ({
    id: item.id,
    sender: "senior",
    text: item.text,
    timestamp: item.timestamp,
  }));

  return {
    senior: uncleTan,
    messages,
    currentRiskLevel,
  };
}

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
    await resetDemoPersistence();

    const context = contextFor(SCENARIO.length - 1, "green");
    const triageResult = await runTriageTimelineAgent(context);
    await persistQuickDemoTimelineResult({
      seniorId: DEMO_SENIOR_ID,
      messages: SCENARIO,
      context,
      result: triageResult,
    });

    const state = await readDemoDashboardState();
    return NextResponse.json({
      status: "ok",
      demo: "quick",
      scenario: "4-day mobility, appetite, and withdrawal pattern",
      messagesRun: SCENARIO.length,
      signalsDetected: triageResult.data.messages.reduce(
        (sum, analysis) => sum + analysis.signals.length,
        0
      ),
      queueCount: state.data.followUpQueue.length,
      queue: state.data.followUpQueue,
      durationMs: Date.now() - startedAt,
      persistence: state.persistence,
    });
  } catch (error) {
    return jsonError("Failed to run quick Pattern Watch demo", {
      error,
      status: 500,
    });
  }
}
