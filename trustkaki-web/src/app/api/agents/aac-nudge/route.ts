// /api/agents/aac-nudge
// Crafts gentle social engagement nudges for seniors showing withdrawal signals

import { NextRequest, NextResponse } from "next/server";
import { runAACNudgeAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import type { AgentRunContext, TriageSignal } from "@/lib/agents/contracts";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context, triageSignals } = body as {
      message: string;
      context: AgentRunContext;
      triageSignals?: TriageSignal[];
    };

    if (!message || typeof message !== "string") {
      return NextResponse.json(
        { error: "Missing or invalid 'message' field" },
        { status: 400 }
      );
    }

    if (!context || !context.senior) {
      return NextResponse.json(
        { error: "Missing or invalid 'context' field" },
        { status: 400 }
      );
    }

    const result = await runAACNudgeAgent(
      message,
      context,
      triageSignals || []
    );
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "AAC Nudge agent failed", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const provider = getLLMProvider();
  return NextResponse.json({
    agent: "aac_nudge",
    description:
      "Crafts gentle social engagement nudges for seniors showing withdrawal",
    llmConfigured: provider.isConfigured,
    model: provider.getModel(),
  });
}
