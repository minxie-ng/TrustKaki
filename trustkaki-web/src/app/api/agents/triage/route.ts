// /api/agents/triage
// Analyzes a senior's message for health, daily living, digital safety, and social signals

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { agentMessageRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import {
  authJsonError,
  canAccessSenior,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { runTriageAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { loadAuthorizedAgentContext } from "@/lib/persistence/seniorContextRepository";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "agent:triage",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = await parseJsonBody(request, agentMessageRequestSchema);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { seniorId, message } = parsed.data;
    if (!canAccessSenior(authResult.auth, seniorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const context = await loadAuthorizedAgentContext({
      auth: authResult.auth,
      seniorId,
    });

    const result = await runTriageAgent(message, context);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError("Triage agent failed", { error, status: 500 });
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
