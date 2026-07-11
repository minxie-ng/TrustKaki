import { NextResponse } from "next/server";
import { uncleTan } from "@/data/demo";
import { orchestrate } from "@/lib/agents/orchestrator";
import {
  persistOrchestrationResult,
  readDashboardState,
  resetDemoPersistence,
} from "@/lib/persistence/trustkakiRepository";
import type { AgentRunContext, OrchestrateResponse } from "@/lib/agents/contracts";
import type { Message, RiskLevel } from "@/lib/types";

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

export async function POST() {
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
        message: item.text,
        context,
        result,
      });
      messages.push(inbound);
      currentRiskLevel = result.policy.finalRisk;
      results.push(result);
    }

    const state = await readDashboardState();
    return NextResponse.json({
      status: "ok",
      scenario: "4-day mobility and withdrawal pattern",
      messagesRun: SCENARIO.length,
      signalsDetected: results.reduce((sum, result) => sum + result.signals.length, 0),
      queueCount: state.data.followUpQueue.length,
      queue: state.data.followUpQueue,
      durationMs: Date.now() - startedAt,
      persistence: state.persistence,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Failed to run Pattern Watch demo", detail: message },
      { status: 500 }
    );
  }
}
