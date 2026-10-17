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
import { personalMemoryPreview } from "@/lib/memory/agentContext";
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

  let stage: "request" | "context" | "orchestration" | "persistence" = "request";
  try {
    const parsed = await parseJsonBody(request, agentMessageRequestSchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const { seniorId, message, clientMessageId } = parsed.data;
    if (!canAccessSenior(authResult.auth, seniorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    stage = "context";
    const context = await loadAuthorizedAgentContext({
      auth: authResult.auth,
      seniorId,
      query: message,
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

    stage = "orchestration";
    const result = await orchestrate(message, contextWithInbound);
    stage = "persistence";
    const persistence = await persistOrchestrationResult({
      seniorId,
      message,
      clientMessageId: inboundMessage.id,
      context: contextWithInbound,
      result,
    });

    return NextResponse.json({ ...result, persistence,
      ...(authResult.auth.role === "demo_admin" ? { retrieval: personalMemoryPreview(context.personalMemory) } : {}),
    });
  } catch (error) {
    // Log fixed labels only: errors can contain senior data or provider payloads.
    const operations = [
      "bind orchestration persistence", "select active check-in", "insert active check-in",
      "upsert inbound message", "select replayed inbound message",
      "upsert messages with client IDs", "insert messages without client IDs",
      "upsert agent runs", "insert detected signals", "insert policy risk event",
      "update check-in risk", "update senior risk", "insert policy alerts", "insert brief",
    ];
    const operation = stage === "persistence" && error instanceof Error
      ? operations.find(label => error.message.startsWith(`${label}:`)) ?? "unknown"
      : "unknown";
    console.error("[TrustKaki:orchestrate] Request failed", {
      stage, kind: error instanceof TypeError ? "type_error" : "error", operation,
    });
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
