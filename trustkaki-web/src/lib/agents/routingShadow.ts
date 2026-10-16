import { randomUUID } from "node:crypto";
import type { AgentTrace } from "@/lib/types";
import type { AgentRunContext } from "./contracts";
import { buildRoutingShadowRequest, parseRoutingShadowResponse, routingFlags, triageRoutingJudgment,
  type RoutingJudgment } from "./routingContract";
import { OPENROUTER_JEV_ENDPOINT } from "./socialIntentContract";

interface RoutingShadowRun {
  judgment: RoutingJudgment | null;
  modelUsed: string;
  durationMs: number;
  messageCharacters: number;
  usage: ReturnType<typeof parseRoutingShadowResponse>["usage"] | null;
  errorMessage: string | null;
}

// Independent opt-in: enabling social replies does not enable shadow routing.
export async function runJevRoutingShadow(message: string, context: AgentRunContext): Promise<RoutingShadowRun | null> {
  if (process.env.TRUSTKAKI_JEV_ROUTING_SHADOW_ENABLED !== "true") return null;
  const start = performance.now();
  const observation: RoutingShadowRun = { judgment: null, modelUsed: "none", durationMs: 0,
    messageCharacters: message.length, usage: null, errorMessage: null };
  let errorCode = "jev_routing_not_configured";
  try {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    if (!key) throw new Error();
    errorCode = "jev_routing_input_bounds";
    const body = buildRoutingShadowRequest(message, context);
    errorCode = "jev_routing_unavailable";
    const response = await fetch(OPENROUTER_JEV_ENDPOINT, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify(body),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    errorCode = "jev_routing_invalid_output";
    const parsed = parseRoutingShadowResponse(await response.json());
    if (parsed.usage.input_tokens > 262144) throw new Error();
    observation.judgment = parsed.judgment;
    observation.modelUsed = parsed.model;
    observation.usage = parsed.usage;
  } catch {
    observation.errorMessage = errorCode;
  }
  observation.durationMs = performance.now() - start;
  return observation;
}

export function routingShadowTrace(observation: RoutingShadowRun, triageResult: unknown): AgentTrace {
  let triageJudgment: RoutingJudgment | null = null;
  try { triageJudgment = triageRoutingJudgment(triageResult); } catch { /* Unavailable baseline is not negative evidence. */ }
  const disagreements = observation.judgment && triageJudgment
    ? routingFlags.filter(flag => observation.judgment![flag] !== triageJudgment![flag]) : null;
  const decisions = observation.judgment
    ? routingFlags.map(flag => `${flag.replaceAll("_", " ")} ${observation.judgment![flag]}`).join("; ")
    : "Jev routing unavailable";
  const comparison = disagreements === null ? "Comparison unavailable."
    : disagreements.length ? `Different from Triage on ${disagreements.map(flag => flag.replaceAll("_", " ")).join(", ")}.`
    : "All six labels agree with Triage.";
  const summary = `Shadow only. ${decisions}. ${comparison} Existing routing and policy remain in control.`;
  return { id: `trace_jev_routing_${randomUUID()}`, agentId: "orchestrator", agentName: "Jev Routing Shadow",
    timestamp: new Date().toISOString(), input: JSON.stringify({ messageCharacters: observation.messageCharacters }),
    reasoning: "Compare proposed routing only; no action authority.",
    output: JSON.stringify({ mode: "shadow", jevJudgment: observation.judgment, triageJudgment, disagreements, usage: observation.usage }),
    tags: ["routing_shadow", observation.judgment ? "observed" : "unavailable", ...(disagreements?.length ? ["routing_disagreement"] : [])],
    durationMs: observation.durationMs, modelUsed: observation.modelUsed, fallback: observation.judgment === null,
    inputSummary: "Current message and bounded context reviewed for six shadow routing labels.", outputSummary: summary,
    stateChanges: [], errorMessage: observation.errorMessage };
}
