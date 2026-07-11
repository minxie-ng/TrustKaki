// /api/agents/briefing
// Synthesizes agent findings into caregiver and AAC volunteer briefings

import { NextRequest, NextResponse } from "next/server";
import { runBriefingAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { persistManualBriefingResult } from "@/lib/persistence/trustkakiRepository";
import type {
  AgentRunContext,
  TriageOutput,
  AACNudgeOutput,
  DigitalSafetyOutput,
} from "@/lib/agents/contracts";

export const maxDuration = 30;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { context, triageResult, aacNudgeResult, digitalSafetyResult, trigger } =
      body as {
        context: AgentRunContext;
        triageResult?: TriageOutput;
        aacNudgeResult?: AACNudgeOutput;
        digitalSafetyResult?: DigitalSafetyOutput;
        trigger?: "manual_override";
      };

    if (!context || !context.senior) {
      return NextResponse.json(
        { error: "Missing or invalid 'context' field" },
        { status: 400 }
      );
    }

    if (trigger !== "manual_override") {
      return NextResponse.json(
        {
          error:
            "Manual briefing requests must include trigger: \"manual_override\"",
        },
        { status: 400 }
      );
    }

    const result = await runBriefingAgent(
      context,
      triageResult,
      aacNudgeResult,
      digitalSafetyResult
    );
    const data = {
      ...result.data,
      overallRisk: context.currentRiskLevel,
    };
    const persistence = await persistManualBriefingResult({
      context,
      result,
      briefing: data,
    });

    return NextResponse.json({
      ...result,
      trigger,
      persistence,
      reasoning: `Manual override requested by human operator. ${result.reasoning}`,
      output: JSON.stringify(data, null, 2),
      tags: [...result.tags, "manual_override"],
      data,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: "Briefing agent failed", detail: message },
      { status: 500 }
    );
  }
}

export async function GET() {
  const provider = getLLMProvider();
  return NextResponse.json({
    agent: "briefing",
    description:
      "Synthesizes agent findings into caregiver and AAC volunteer briefings",
    llmConfigured: provider.isConfigured,
    model: provider.getModel(),
  });
}
