// /api/agents/orchestrate
// Full multi-agent orchestration: triage → specialists → briefing

import { NextRequest, NextResponse } from "next/server";
import { orchestrate } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { orchestratorInputSchema } from "@/lib/agents/schemas";
import { persistOrchestrationResult } from "@/lib/persistence/trustkakiRepository";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = orchestratorInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid orchestration input" },
        { status: 400 }
      );
    }

    const { message, context } = parsed.data;

    const result = await orchestrate(message, context);
    const persistence = await persistOrchestrationResult({
      message,
      context,
      result,
    });

    return NextResponse.json({ ...result, persistence });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Orchestration failed", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const provider = getLLMProvider();
  return NextResponse.json({
    agent: "orchestrator",
    description:
      "Full multi-agent orchestration: triage → specialists → briefing",
    llmConfigured: provider.isConfigured,
    model: provider.getModel(),
    endpoints: {
      POST: "Send { message: string, context: AgentRunContext } to run full orchestration",
    },
  });
}
