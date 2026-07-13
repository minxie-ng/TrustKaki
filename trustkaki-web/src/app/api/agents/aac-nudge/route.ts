// /api/agents/aac-nudge
// Crafts gentle social engagement nudges for seniors showing withdrawal signals

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { parseJsonBody, specialistAgentRequestSchema } from "@/lib/api/schemas";
import {
  authJsonError,
  canAccessSenior,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { runAACNudgeAgent, runTriageAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { loadAuthorizedAgentContext } from "@/lib/persistence/seniorContextRepository";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "agent:aac_nudge",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = await parseJsonBody(request, specialistAgentRequestSchema);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { seniorId, message } = parsed.data;
    if (!canAccessSenior(authResult.auth, seniorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const context = await loadAuthorizedAgentContext({
      auth: authResult.auth,
      seniorId,
    });
    const triageResult = await runTriageAgent(message, context);

    const result = await runAACNudgeAgent(
      message,
      context,
      triageResult.data.signals
    );
    return NextResponse.json(result);
  } catch (error) {
    return jsonError("AAC Nudge agent failed", { error, status: 500 });
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
