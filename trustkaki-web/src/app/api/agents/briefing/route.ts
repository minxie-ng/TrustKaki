// /api/agents/briefing
// Synthesizes agent findings into caregiver and AAC volunteer briefings

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { manualBriefingRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import {
  authJsonError,
  canAccessSenior,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { runBriefingAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { loadAuthorizedAgentContext } from "@/lib/persistence/seniorContextRepository";
import { persistManualBriefingResult } from "@/lib/persistence/trustkakiRepository";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "agent:briefing",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = await parseJsonBody(request, manualBriefingRequestSchema);
    if (!parsed.ok) {
      const error =
        parsed.status === 400
          ? 'Manual briefing requests must include trigger: "manual_override"'
          : parsed.error;
      return NextResponse.json({ error }, { status: parsed.status });
    }
    const { seniorId, trigger } = parsed.data;
    if (!canAccessSenior(authResult.auth, seniorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const context = await loadAuthorizedAgentContext({
      auth: authResult.auth,
      seniorId,
    });
    const result = await runBriefingAgent(context);
    const data = {
      ...result.data,
      overallRisk: context.currentRiskLevel,
    };
    const persistence = await persistManualBriefingResult({
      seniorId,
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
    return jsonError("Briefing agent failed", { error, status: 500 });
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
