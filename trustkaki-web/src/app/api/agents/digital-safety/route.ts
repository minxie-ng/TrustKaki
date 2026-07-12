// /api/agents/digital-safety
// Detects scams, phishing, and digital threats in senior messages

import { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/api/responses";
import { checkRateLimit } from "@/lib/api/rateLimit";
import { agentMessageRequestSchema, parseJsonBody } from "@/lib/api/schemas";
import {
  authJsonError,
  requireAuthenticatedCaregiver,
} from "@/lib/auth/session";
import { runDigitalSafetyAgent } from "@/lib/agents/orchestrator";
import { getLLMProvider } from "@/lib/agents/provider";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: NextRequest) {
  const authResult = await requireAuthenticatedCaregiver(request);
  if (!authResult.ok) return authJsonError(authResult);
  const rateLimit = checkRateLimit({
    key: authResult.auth.userId,
    route: "agent:digital_safety",
    limit: 20,
    windowMs: 60_000,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  try {
    const parsed = await parseJsonBody(request, agentMessageRequestSchema);
    if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    const { message, context } = parsed.data;

    const result = await runDigitalSafetyAgent(message, context);
    return NextResponse.json(result);
  } catch (error) {
    return jsonError("Digital Safety agent failed", { error, status: 500 });
  }
}

export async function GET() {
  const provider = getLLMProvider();
  return NextResponse.json({
    agent: "digital_safety",
    description:
      "Detects scams, phishing, and digital threats in senior messages",
    llmConfigured: provider.isConfigured,
    model: provider.getModel(),
  });
}
