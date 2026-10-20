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
import { webRequestReceipt, type WebRequestIdentity } from "@/lib/persistence/webRequestReceipt";
import { serializeOrchestrationRetryEnvelope, restoreOrchestrationRetryEnvelope } from "@/lib/persistence/orchestration";
import type { AgentRunContext, OrchestrationResult } from "@/lib/agents/contracts";
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
    return NextResponse.json({ error: "Too many requests" }, { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } });
  }

  let stage: "request" | "receipt" | "context" | "orchestration" | "snapshot" | "persistence" | "completion" = "request";
  let identity: WebRequestIdentity | undefined;
  let claimed = false;
  const respond = (body: Record<string, unknown>) => {
    const { retrieval, ...rest } = body;
    return NextResponse.json({ ...rest, traces: authResult.auth.role === "demo_admin" ? body.traces : [],
      ...(authResult.auth.role === "demo_admin" ? {retrieval} : {}) });
  };
  try {
    const parsed = await parseJsonBody(request, agentMessageRequestSchema);
    if (!parsed.ok) {
      return NextResponse.json({ error: parsed.error }, { status: parsed.status });
    }
    const { seniorId, message, clientMessageId } = parsed.data;
    if (!canAccessSenior(authResult.auth, seniorId)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    identity = {userId:authResult.auth.userId,seniorId,message,
      clientMessageId:clientMessageId ?? crypto.randomUUID(),token:crypto.randomUUID()};
    stage = "receipt";
    const receipt = await webRequestReceipt(identity,"claim");
    if (receipt.status === "rate_limited") return NextResponse.json({error:"Too many new messages. Wait before starting another message.",code:"rate_limited"},{status:429,headers:{"Retry-After":"60"}});
    if (receipt.status === "replay") return respond(receipt.payload as Record<string,unknown>);
    if (receipt.status === "busy") return NextResponse.json({error:"This message is still processing or awaiting review. Retry the same message later; check Activity before starting a new one.",code:"request_in_progress"},{status:409,headers:{"Retry-After":"5"}});
    if (receipt.status === "conflict") return NextResponse.json({error:"This request ID is already assigned to a different message.",code:"request_id_conflict"},{status:409});
    if (receipt.status === "expired") return NextResponse.json({error:"This request can no longer be replayed. Check Activity for the saved outcome.",code:"request_expired"},{status:410});
    if (receipt.status !== "run" && receipt.status !== "resume") throw new Error("Invalid request claim");
    claimed = true;
    let contextWithInbound: AgentRunContext;
    let result: OrchestrationResult;
    if (receipt.status === "resume") {
      const snapshot = receipt.payload as {context:AgentRunContext;result:unknown};
      contextWithInbound = snapshot.context;
      result = restoreOrchestrationRetryEnvelope(snapshot.result);
    } else {
      stage = "context";
      const context = await loadAuthorizedAgentContext({auth:authResult.auth,seniorId,query:message});
      const inboundMessage: Message = {id:identity.clientMessageId,sender:"senior",text:message,timestamp:new Date().toISOString()};
      contextWithInbound = {...context,messages:[...context.messages,inboundMessage]};
      stage = "orchestration";
      result = await orchestrate(message,contextWithInbound);
      stage = "snapshot";
      await webRequestReceipt(identity,"snapshot",{context:contextWithInbound,result:serializeOrchestrationRetryEnvelope(result)});
    }
    stage = "persistence";
    const persistence = await persistOrchestrationResult({seniorId,message,clientMessageId:identity.clientMessageId,context:contextWithInbound,result});
    const body = {...result,persistence,retrieval:personalMemoryPreview(contextWithInbound.personalMemory)};
    stage = "completion";
    await webRequestReceipt(identity,"complete",body);
    return respond(body);
  } catch (error) {
    // Only retry persistence from a frozen result. Never restart uncertain model work.
    if (claimed && identity && (stage === "context" || stage === "persistence" || stage === "snapshot" || stage === "completion")) {
      try { await webRequestReceipt(identity,stage === "context" ? "cancel" : "release"); }
      catch { console.error("[TrustKaki:orchestrate] Receipt recovery failed", {stage}); }
    }
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
