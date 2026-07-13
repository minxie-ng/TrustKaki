import { NextResponse } from "next/server";
import { uncleTan } from "@/data/demo";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import { orchestrate } from "@/lib/agents/orchestrator";
import {
  persistOrchestrationResult,
  readDemoDashboardState,
  resetDemoPersistence,
} from "@/lib/persistence/trustkakiRepository";
import { DEMO_SENIOR_ID } from "@/lib/persistence/orchestration";
import type { AgentRunContext, OrchestrateResponse } from "@/lib/agents/contracts";
import type { Message, RiskLevel } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;

const SCENARIO = [
  {
    id: "pattern_demo_day_1",
    text: "My knee pain today. Walking feels uncomfortable.",
    timestamp: "2026-07-07T08:00:00.000Z",
  },
  {
    id: "pattern_demo_day_2",
    text: "Not hungry today. I skipped breakfast.",
    timestamp: "2026-07-08T08:00:00.000Z",
  },
  {
    id: "pattern_demo_day_3",
    text: "I avoid going downstairs. Staying home because my leg is stiff.",
    timestamp: "2026-07-09T08:00:00.000Z",
  },
  {
    id: "pattern_demo_day_4",
    text: "Missed usual check-in. Don't want to join lunch, paiseh.",
    timestamp: "2026-07-10T08:00:00.000Z",
  },
];

export async function POST(request: Request) {
  const authResult = await requireDemoAdmin(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "demo:full",
    limit: 2,
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

  if (
    process.env.NODE_ENV === "production" &&
    process.env.ENABLE_FULL_AGENT_REPLAY !== "true"
  ) {
    return NextResponse.json(
      {
        error: "Full Agent Replay is not available",
        demo: "full_agent_replay",
      },
      { status: 404 }
    );
  }

  const startedAt = Date.now();
  try {
    await resetDemoPersistence();

    const messages: Message[] = [];
    let currentRiskLevel: RiskLevel = "green";
    const results: OrchestrateResponse[] = [];

    for (const item of SCENARIO) {
      const inbound: Message = {
        id: item.id,
        sender: "senior",
        text: item.text,
        timestamp: item.timestamp,
      };
      const context: AgentRunContext = {
        senior: uncleTan,
        messages: [...messages, inbound],
        currentRiskLevel,
      };
      const result = await orchestrate(item.text, context);
      await persistOrchestrationResult({
        seniorId: DEMO_SENIOR_ID,
        message: item.text,
        clientMessageId: item.id,
        context,
        result,
      });
      messages.push(inbound);
      currentRiskLevel = result.policy.finalRisk;
      results.push(result);
    }

    const state = await readDemoDashboardState();
    return NextResponse.json({
      status: "ok",
      warning:
        "Full Agent Replay may take over one minute. Quick Demo is the primary judge path.",
      scenario: "4-day mobility and withdrawal pattern",
      messagesRun: SCENARIO.length,
      signalsDetected: results.reduce((sum, result) => sum + result.signals.length, 0),
      queueCount: state.data.followUpQueue.length,
      queue: state.data.followUpQueue,
      durationMs: Date.now() - startedAt,
      persistence: state.persistence,
    });
  } catch (error) {
    return jsonError("Failed to run Pattern Watch demo", { error, status: 500 });
  }
}
