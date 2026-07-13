// /api/agents/orchestrate
// Full multi-agent orchestration: triage → specialists → briefing

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { agentMessageRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import {
  authJsonError,
  canAccessSenior,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { orchestrate } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { loadAuthorizedAgentContext } from "@/lib/persistence/seniorContextRepository";
import { persistOrchestrationResult } from "@/lib/persistence/trustkakiRepository";
import type { Message } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "agent:orchestrate",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = await parseJsonBody(request, agentMessageRequestSchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const { seniorId, message, clientMessageId } = parsed.data;
    if (!canAccessSenior(authResult.auth, seniorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const context = await loadAuthorizedAgentContext({
      auth: authResult.auth,
      seniorId,
    });
    const inboundMessage: Message = {
      id: clientMessageId ?? crypto.randomUUID(),
      sender: "senior",
      text: message,
      timestamp: new Date().toISOString(),
    };
    const contextWithInbound = {
      ...context,
      messages: [...context.messages, inboundMessage],
    };

    const result = await orchestrate(message, contextWithInbound);
    const persistence = await persistOrchestrationResult({
      message,
      context: contextWithInbound,
      result,
    });

    return NextResponse.json({ ...result, persistence });
  } catch (error) {
    return jsonError("Orchestration failed", { error, status: 500 });
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
      POST: "Send a senior-scoped message to run full orchestration",
    },
  });
}
