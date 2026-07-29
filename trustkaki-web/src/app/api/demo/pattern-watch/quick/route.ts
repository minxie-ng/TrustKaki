import { NextResponse } from "next/server";
import { uncleTan } from "@/data/demo";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { authJsonError, requireDemoAdmin } from "@/lib/auth/session";
import {
  persistQuickDemoTimelineResult,
  readDashboardState,
} from "@/lib/persistence/trustkakiRepository";
import { resetDemoPersistence } from "@/lib/persistence/demoRepository";
import { DEMO_SENIOR_ID } from "@/lib/persistence/orchestration";
import type {
  AgentRunContext,
  AgentRunResult,
  TriageSignal,
  TriageTimelineOutput,
} from "@/lib/agents/contracts";
import type { Message, RiskLevel } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const DAY_MS = 24 * 60 * 60 * 1000;

const SCENARIO_MESSAGES = [
  {
    id: "quick_pattern_demo_day_1",
    text: "My knee pain today. Walking feels uncomfortable.",
  },
  {
    id: "quick_pattern_demo_day_2",
    text: "Not hungry today. I skipped breakfast.",
  },
  {
    id: "quick_pattern_demo_day_3",
    text: "I avoid going downstairs. Staying home because my leg is stiff.",
  },
  {
    id: "quick_pattern_demo_day_4",
    text: "Missed usual check-in. Don't want to join lunch, paiseh.",
  },
];

function scenarioFor(now: Date) {
  return SCENARIO_MESSAGES.map((item, index) => ({
    ...item,
    timestamp: new Date(
      now.getTime() - (SCENARIO_MESSAGES.length - index - 1) * DAY_MS
    ).toISOString(),
  }));
}

function contextFor(
  scenario: ReturnType<typeof scenarioFor>,
  currentRiskLevel: RiskLevel
): AgentRunContext {
  const messages: Message[] = scenario.map((item) => ({
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

function deterministicTimelineResult(
  context: AgentRunContext,
  now: Date
): AgentRunResult<TriageTimelineOutput> {
  const signalsByMessage: TriageSignal[][] = [
    [
      {
        type: "health",
        category: "health_frailty_signal",
        description: "Knee pain and walking discomfort are affecting movement.",
        severity: "medium",
      },
    ],
    [
      {
        type: "daily_living",
        category: "daily_living",
        description: "Not hungry today and skipped breakfast.",
        severity: "medium",
      },
    ],
    [
      {
        type: "health",
        category: "health_frailty_signal",
        description: "Avoiding downstairs trips because the leg is stiff.",
        severity: "medium",
      },
    ],
    [
      {
        type: "social",
        category: "social_isolation",
        description: "Missed the usual check-in and does not want to join lunch; feeling paiseh.",
        severity: "medium",
      },
    ],
  ];

  return {
    agentId: "triage",
    agentName: "Triage Agent",
    traceId: `quick-demo-${now.getTime()}`,
    timestamp: now.toISOString(),
    input: JSON.stringify(context.messages),
    reasoning:
      "Deterministic judge-demo fixture preserves the validated four-day Pattern Watch scenario.",
    output: "Four dated care signals extracted for Pattern Watch.",
    tags: ["demo", "deterministic", "pattern_watch"],
    data: {
      messages: context.messages.map((message, index) => ({
        messageId: message.id,
        signals: signalsByMessage[index] ?? [],
        riskLevel: index === context.messages.length - 1 ? "yellow" : "green",
        summary: "Validated demo signal recorded for Pattern Watch.",
        humanFollowUpRequired: true,
      })),
      overallRiskLevel: "yellow",
      summary:
        "A four-day pattern combines mobility discomfort, appetite disruption, and reduced participation.",
    },
    durationMs: 0,
    modelUsed: "deterministic-demo-fixture",
    fallback: false,
    inputSummary: "Validated four-day judge-demo timeline",
    outputSummary: "Four deterministic signals for Pattern Watch",
    stateChanges: ["signals:detect_timeline", "risk:suggest_timeline"],
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
    await resetDemoPersistence({ accessToken: authResult.accessToken });

    const scenario = scenarioFor(new Date());
    const context = contextFor(scenario, "green");
    const triageResult = deterministicTimelineResult(context, new Date());
    await persistQuickDemoTimelineResult({
      seniorId: DEMO_SENIOR_ID,
      messages: scenario,
      context,
      result: triageResult,
    });

    const state = await readDashboardState({
      auth: authResult.auth,
      seniorId: DEMO_SENIOR_ID,
    });
    return NextResponse.json({
      status: "ok",
      demo: "quick",
      scenario: "4-day mobility, appetite, and withdrawal pattern",
      messagesRun: scenario.length,
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
