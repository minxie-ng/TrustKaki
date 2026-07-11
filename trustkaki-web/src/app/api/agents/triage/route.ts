// /api/agents/triage
// Analyzes a senior's message for health, daily living, digital safety, and social signals

import { NextRequest, NextResponse } from "next/server";
import { runTriageAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import type { AgentRunContext } from "@/lib/agents/contracts";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { message, context } = body as {
      message: string;
      context: AgentRunContext;
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

    const result = await runTriageAgent(message, context);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Triage agent failed", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const provider = getLLMProvider();
  return NextResponse.json({
    agent: "triage",
    description:
      "Analyzes messages for health, daily living, digital safety, and social signals",
    llmConfigured: provider.isConfigured,
    model: provider.getModel(),
  });
}
