// /api/agents/orchestrate
// Full multi-agent orchestration: triage → specialists → briefing

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import {
  authJsonError,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { orchestrate } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";
import { orchestratorInputSchema } from "@/lib/agents/schemas";
import { persistOrchestrationResult } from "@/lib/persistence/trustkakiRepository";

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
      POST: "Send { message: string, context: AgentRunContext } to run full orchestration",
    },
  });
}
