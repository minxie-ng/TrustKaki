// ─── Orchestrator: Multi-Agent Orchestration Logic ───
// Chains: triage → (aac_nudge | digital_safety in parallel) → briefing

import type { AgentId, AgentTrace } from "@/lib/types";
import type {
  AgentRunContext,
  AgentRunResult,
  OrchestrateResponse,
  OrchestrationResult,
  OrchestratorOutput,
  TriageOutput,
  TriageTimelineOutput,
  TriageSignal,
  AACNudgeOutput,
  DigitalSafetyOutput,
  BriefingOutput,
  ContextMemoryInput,
  ContextMemoryOutput,
} from "./contracts";
import {
  orchestratorOutputSchema,
  triageOutputSchema,
  triageTimelineOutputSchema,
  aacNudgeOutputSchema,
  digitalSafetyOutputSchema,
  briefingOutputSchema,
  contextMemoryOutputSchema,
} from "./schemas";
import { runAgent, toAgentTrace } from "./runner";
import { applyPolicy } from "./policy";
import type { PolicyResult } from "./policy";
import { evaluatePatternWatch, type PatternSignal } from "@/lib/patterns/patternWatch";
import {
  ORCHESTRATOR_PROMPT,
  orchestratorUserPrompt,
  TRIAGE_PROMPT,
  triageUserPrompt,
  triageTimelineUserPrompt,
  AAC_NUDGE_PROMPT,
  aacNudgeUserPrompt,
  DIGITAL_SAFETY_PROMPT,
  digitalSafetyUserPrompt,
  BRIEFING_PROMPT,
  briefingUserPrompt,
  CONTEXT_MEMORY_PROMPT,
  contextMemoryUserPrompt,
} from "./prompts";
import { contextMemoryFallback } from "./fallbacks";

const contextMemoryTextExclusionPatterns = [
  /^(?:hi|hello|hey)(?: there|(?: [a-z'-]+){1,2})?$/,
  /^(?:good (?:morning|afternoon|evening)|ok|okay|how are you|have a nice day)$/,
  /^(?:ok |okay )?(?:thanks|thank you)(?: so much| very much)?$/,
  /^(?:the weather is (?:nice|lovely|good|hot|rainy)(?: today)?|(?:nice|lovely|good|hot|rainy) weather(?: today)?(?: isn't it| is it not)?)$/,
] as const;
const prohibitedMemoryDataPatterns = [
  /\+?\d(?:[\s().-]*\d){7,}/g,
  /\b(?:otp|one[- ]time (?:password|pin|code)|pin)\s*(?:(?:is|:|=)\s*)?\d{4,12}\b/gi,
  /\b(?:password|passcode|credentials?)\s*(?:(?:is|are|:|=)\s*)?[^\s,.;]{4,}/gi,
  /\b(?:bank\s+)?account(?:\s+(?:number|no\.?))?\s*(?:is|:|=)?\s*\d(?:[\s-]*\d){5,}/gi,
  /\b(?:credit|debit|bank)\s+card(?:\s+(?:number|no\.?))?\s*(?:is|:|=)?\s*\d(?:[\s-]*\d){7,}/gi,
  /\b(?:nric|passport|identity(?: document| card)?|national id)(?:\s+(?:number|no\.?))?\s*(?:is|:|=)?\s*[a-z0-9-]{6,}/gi,
] as const;
const REDACTED_PROHIBITED_DATA = "[REDACTED_PROHIBITED_DATA]";
const durableContextPatterns = [
  /\b(?:i\s+)?(?:prefer|would rather|like)\b.{0,50}\b(?:voice calls?|phone calls?|calls?|texts?|messages?|mandarin|english|language)\b/i,
  /\b(?:i\s+)?(?:prefer|do not eat|don't eat|cannot eat|can't eat|am allergic to)\b.{0,60}\b(?:food|meal|breakfast|lunch|dinner|porridge|rice|meat|vegetables?)\b/i,
  /\b(?:i am|i'm)\s+(?:vegetarian|vegan|pescatarian)\b/i,
  /\b(?:always|usually|every (?:day|morning|afternoon|evening|night|week))\b.{0,80}\b(?:eat|have|wake|sleep|walk|call|visit|exercise|take)\b/i,
  /\b(?:prefer|like|comfortable)\b.{0,50}\b(?:aac|active ageing|one[- ]to[- ]one|group activit(?:y|ies))\b/i,
  /\b(?:large(?:r)? text|small (?:text|words)|hearing aid|hard of hearing|wheelchair|screen reader|captions?|cannot (?:hear|see|read)|can't (?:hear|see|read))\b/i,
  /\b(?:call|contact|tell|notify|message)\s+(?:my\s+)?(?:daughter|son|wife|husband|sister|brother|caregiver|niece|nephew)\b/i,
  /\b(?:daughter|son|wife|husband|sister|brother|caregiver|niece|nephew)\b.{0,40}\b(?:first|call|contact|notify|message)\b/i,
  /\bmy\s+(?:daughter|son|wife|husband|sister|brother|caregiver|niece|nephew)\b.{0,50}\b(?:handles?|manages?|arranges?)\b.{0,30}\b(?:appointments?|calls?|visits?|care)\b/i,
  /\b(?:pain|mobility|hearing|vision|breathing|appetite|sleep)\b.{0,50}\b(?:chronic|ongoing|long[- ]term|persistent|for (?:many )?(?:years|months))\b/i,
  /\b(?:chronic|ongoing|long[- ]term|persistent|for (?:many )?(?:years|months))\b.{0,50}\b(?:pain|mobility|hearing|vision|breathing|appetite|sleep)\b/i,
] as const;

export function mayContainDurableContext(message: string): boolean {
  if (shouldExcludeContextMemory(message)) return false;
  return hasDurableContextCue(message);
}

function hasDurableContextCue(message: string): boolean {
  return durableContextPatterns.some((pattern) => pattern.test(message));
}

function normalizedMessage(message: string): string {
  return message
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s'-]/g, "")
    .replace(/\s+/g, " ");
}

function redactProhibitedMemoryData(value: string): string {
  return prohibitedMemoryDataPatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED_PROHIBITED_DATA),
    value
  );
}

function shouldExcludeContextMemory(message: string): boolean {
  const normalized = normalizedMessage(message);
  const isBoundedSmallTalk = contextMemoryTextExclusionPatterns.some((pattern) =>
    pattern.test(normalized)
  );
  return (
    !normalized ||
    redactProhibitedMemoryData(message) !== message ||
    (isBoundedSmallTalk && !hasDurableContextCue(message))
  );
}

function contextMemoryInput(
  message: string,
  ctx: AgentRunContext
): ContextMemoryInput {
  const recentMessages = ctx.messages
    .filter((item) => item.sender === "senior")
    .slice(-8)
    .map(({ id, sender, text }) => ({ id, sender, text }));
  const current =
    [...recentMessages].reverse().find((item) => item.text === message) ?? {
      id: "current_message",
      sender: "senior" as const,
      text: message,
    };

  return {
    message: current,
    recentMessages: recentMessages
      .filter((item) => item.id !== current.id)
      .map((item) => ({
        ...item,
        text: redactProhibitedMemoryData(item.text),
      })),
    activeContext: [],
  };
}

function contextMemoryTrace(
  result: AgentRunResult<ContextMemoryOutput>,
  input: ContextMemoryInput
): AgentTrace {
  const categories = [
    ...new Set(result.data.candidates.map((candidate) => candidate.contextType)),
  ].sort();
  const outputSummary = `${result.data.candidates.length} context proposal(s) for deterministic review; categories: ${categories.join(", ") || "none"}`;

  return toAgentTrace({
    ...result,
    input: JSON.stringify(
      {
        messageId: input.message.id,
        recentMessageCount: input.recentMessages.length,
        activeContextCount: input.activeContext.length,
      },
      null,
      2
    ),
    output: JSON.stringify(
      {
        candidateCount: result.data.candidates.length,
        categories,
      },
      null,
      2
    ),
    outputSummary,
  });
}

// ─── Fallback Functions ───
// Safe defaults used when LLM is unavailable or fails.
// These are NOT hardcoded scripted answers — they are minimal
// safe-passthrough responses that avoid false conclusions.

function orchestratorFallback(): OrchestratorOutput {
  return {
    agentsToRun: ["triage"],
    priority: { triage: "high" },
    reasoning:
      "LLM unavailable. Defaulting to triage-only analysis for safety.",
  };
}

function triageFallback(ctx: AgentRunContext): TriageOutput {
  return {
    signals: [],
    riskLevel: ctx.currentRiskLevel,
    riskChange: "none",
    routing: [],
    summary:
      "Unable to analyze message automatically. Manual review recommended.",
    responseMessage:
      "I heard you. Let me note that down. Is there anything else you'd like to share?",
    humanFollowUpRequired: false,
  };
}

function triageTimelineFallback(ctx: AgentRunContext): TriageTimelineOutput {
  return {
    messages: ctx.messages
      .filter((message) => message.sender === "senior")
      .map((message) => ({
        messageId: message.id,
        signals: [],
        riskLevel: ctx.currentRiskLevel,
        summary: "Unable to analyze this message automatically.",
        humanFollowUpRequired: false,
      })),
    overallRiskLevel: ctx.currentRiskLevel,
    summary:
      "Unable to analyze the message timeline automatically. Manual review recommended.",
  };
}

function aacNudgeFallback(): AACNudgeOutput {
  return {
    nudgeMessage:
      "Hey, Mei Ling was asking about you. Maybe a kopi sometime this week? No rush at all.",
    approach: "Gentle, low-pressure 1-on-1 invitation",
    rationale:
      "Default nudge used when AI analysis unavailable. Keeps social connection without pressure.",
    suggestedChannel: "whatsapp",
  };
}

function digitalSafetyFallback(): DigitalSafetyOutput {
  return {
    isScam: false,
    scamType: null,
    confidence: 0,
    warningMessage:
      "I couldn't fully check this message. If it has a link and you're not sure, please don't click it. Ask Rachel first.",
    educationalNote:
      "When in doubt, don't click links in messages. Forward suspicious messages to 77266 (ScamShield).",
  };
}

function briefingFallback(ctx: AgentRunContext): BriefingOutput {
  return {
    forCaregiver: `Unable to generate automated briefing for ${ctx.senior.name}. Please check in manually and review recent messages.`,
    forAACVolunteer: `Automated briefing unavailable. Please reach out to ${ctx.senior.name} directly for a check-in.`,
    overallRisk: ctx.currentRiskLevel,
    keyConcerns: [],
    recommendedActions: ["Manual check-in recommended"],
  };
}

function buildPolicyTrace(
  policyResult: PolicyResult,
  signals: TriageSignal[],
  previousRisk: string
): AgentTrace {
  return {
    id: `trace_policy_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: "policy",
    agentName: "Deterministic Policy",
    timestamp: new Date().toISOString(),
    input: JSON.stringify(
      {
        previousRisk,
        validatedSignals: signals,
      },
      null,
      2
    ),
    reasoning: policyResult.reasoning.join("; "),
    output: JSON.stringify(
      {
        previousRisk,
        finalRisk: policyResult.finalRisk,
        riskChange: policyResult.riskChange,
        briefingRequired: policyResult.briefingRequired,
        alerts: policyResult.alerts,
      },
      null,
      2
    ),
    tags: [
      "policy",
      policyResult.briefingRequired ? "briefing_required" : "no_briefing",
      policyResult.alerts.length > 0 ? "alert_created" : "no_alert",
    ],
    durationMs: 0,
    modelUsed: "deterministic",
    fallback: false,
    inputSummary: `${signals.length} validated signal(s), previous risk ${previousRisk}`,
    outputSummary: `final risk ${policyResult.finalRisk}; briefing ${policyResult.briefingRequired ? "required" : "not required"}; ${policyResult.alerts.length} alert(s)`,
    stateChanges: [
      `risk:${previousRisk}->${policyResult.finalRisk}`,
      policyResult.briefingRequired ? "briefing:policy" : "briefing:none",
      `alerts:${policyResult.alerts.length}`,
    ],
    errorMessage: null,
  };
}

function buildPatternWatchTrace(
  signals: TriageSignal[],
  message: string,
  ctx: AgentRunContext
): AgentTrace {
  const observedAt =
    [...ctx.messages].reverse().find((msg) => msg.sender === "senior" && msg.text === message)
      ?.timestamp ?? new Date().toISOString();
  const patternSignals: PatternSignal[] = signals.map((signal, index) => ({
    id: `runtime_signal_${index}`,
    type: signal.type,
    severity: signal.severity,
    description: signal.description,
    observedAt,
  }));
  const candidates = evaluatePatternWatch(patternSignals);

  return {
    id: `trace_pattern_watch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    agentId: "pattern_watch",
    agentName: "Pattern Watch Engine",
    timestamp: new Date().toISOString(),
    input: JSON.stringify({ recentSignalsChecked: signals.length }, null, 2),
    reasoning:
      "Deterministic Pattern Watch checked whether validated signals form a multi-observation pattern. Persistent Pattern Watch updates after signals are saved.",
    output: JSON.stringify(
      {
        patternCount: candidates.length,
        patterns: candidates.map((candidate) => ({
          patternType: candidate.patternType,
          severity: candidate.severity,
          status: candidate.status,
          evidenceCount: candidate.contributingSignalIds.length,
          suggestedHumanAction: candidate.recommendedAction,
        })),
      },
      null,
      2
    ),
    tags: ["deterministic", "pattern_watch", candidates.length ? "pattern_candidate" : "no_pattern"],
    durationMs: 0,
    modelUsed: "deterministic",
    fallback: false,
    inputSummary: `${signals.length} validated signal(s) checked for rolling patterns`,
    outputSummary: `${candidates.length} pattern candidate(s) in current orchestration context`,
    stateChanges: candidates.map((candidate) => `pattern_candidate:${candidate.patternType}`),
    errorMessage: null,
  };
}

function enforceBriefingRisk(
  briefing: BriefingOutput,
  finalRisk: BriefingOutput["overallRisk"]
): BriefingOutput {
  return {
    ...briefing,
    overallRisk: finalRisk,
  };
}

// ─── Main orchestration function ───
export async function orchestrate(
  message: string,
  ctx: AgentRunContext
): Promise<OrchestrationResult> {
  const traces: AgentTrace[] = [];
  const responseMessages: Array<{ text: string; agentId?: AgentId }> = [];
  let signals: TriageSignal[] = [];
  let briefing: BriefingOutput | null = null;
  let contextMemoryCandidates: ContextMemoryOutput["candidates"] = [];

  // ── Step 1: Run Orchestrator (routing decision) ──
  const orchResult: AgentRunResult<OrchestratorOutput> = await runAgent({
    agentId: "orchestrator",
    agentName: "Orchestrator Agent",
    systemPrompt: ORCHESTRATOR_PROMPT,
    userPrompt: orchestratorUserPrompt(message, ctx),
    schema: orchestratorOutputSchema,
    fallback: orchestratorFallback,
    temperature: 0.3,
    inputSummary: `Route message for ${ctx.senior.name}`,
    stateChanges: ["execution_plan:requested"],
  });
  traces.push(toAgentTrace(orchResult));

  const agentsToRun = new Set(orchResult.data.agentsToRun);

  // ── Step 2: Run Triage (always) ──
  const triageResult: AgentRunResult<TriageOutput> = await runAgent({
    agentId: "triage",
    agentName: "Triage Agent",
    systemPrompt: TRIAGE_PROMPT,
    userPrompt: triageUserPrompt(message, ctx),
    schema: triageOutputSchema,
    fallback: () => triageFallback(ctx),
    temperature: 0.5,
    inputSummary: `Classify senior message into care and safety signals`,
    stateChanges: ["signals:detect", "risk:suggest", "senior_reply:draft"],
  });
  traces.push(toAgentTrace(triageResult));

  signals = triageResult.data.signals;

  // Add triage response message to chat
  responseMessages.push({
    text: triageResult.data.responseMessage,
    agentId: "triage",
  });

  // ── Step 3: Run specialist agents in parallel based on routing ──

  const runAACNudge: Promise<AgentRunResult<AACNudgeOutput> | null> =
    agentsToRun.has("aac_nudge") ||
    triageResult.data.routing.includes("aac_nudge")
      ? runAgent({
          agentId: "aac_nudge",
          agentName: "AAC Nudge Agent",
          systemPrompt: AAC_NUDGE_PROMPT,
          userPrompt: aacNudgeUserPrompt(message, ctx, signals),
          schema: aacNudgeOutputSchema,
          fallback: aacNudgeFallback,
          temperature: 0.7,
          inputSummary: `Generate low-pressure AAC nudge from social signals`,
          stateChanges: ["senior_reply:aac_nudge"],
        }).then((result) => {
          traces.push(toAgentTrace(result));
          responseMessages.push({
            text: result.data.nudgeMessage,
            agentId: "aac_nudge",
          });
          return result;
        })
      : Promise.resolve(null);

  const runDigitalSafety: Promise<AgentRunResult<DigitalSafetyOutput> | null> =
    agentsToRun.has("digital_safety") ||
    triageResult.data.routing.includes("digital_safety")
      ? runAgent({
          agentId: "digital_safety",
          agentName: "Digital Safety Agent",
          systemPrompt: DIGITAL_SAFETY_PROMPT,
          userPrompt: digitalSafetyUserPrompt(message, ctx),
          schema: digitalSafetyOutputSchema,
          fallback: digitalSafetyFallback,
          temperature: 0.3,
          inputSummary: `Assess suspicious digital-safety content without guaranteeing detection`,
          stateChanges: ["senior_reply:digital_safety_if_scam"],
        }).then((result) => {
          traces.push(toAgentTrace(result));
          if (result.data.isScam) {
            responseMessages.push({
              text: result.data.warningMessage,
              agentId: "digital_safety",
            });
          }
          return result;
        })
      : Promise.resolve(null);

  const runContextMemory: Promise<AgentRunResult<ContextMemoryOutput> | null> =
    !shouldExcludeContextMemory(message) &&
    (agentsToRun.has("context_memory") || mayContainDurableContext(message))
      ? (() => {
          const input = contextMemoryInput(message, ctx);
          return runAgent({
            agentId: "context_memory",
            agentName: "Context Memory Agent",
            systemPrompt: CONTEXT_MEMORY_PROMPT,
            userPrompt: contextMemoryUserPrompt(input),
            schema: contextMemoryOutputSchema,
            fallback: contextMemoryFallback,
            temperature: 0.2,
            inputSummary:
              "Review one senior message for durable context proposals",
            stateChanges: ["context:proposals_requested"],
          }).then((result) => {
            traces.push(contextMemoryTrace(result, input));
            contextMemoryCandidates = result.data.candidates;
            return result;
          });
        })()
      : Promise.resolve(null);

  const [aacNudgeResult, digitalSafetyResult] = await Promise.all([
    runAACNudge,
    runDigitalSafety,
    runContextMemory,
  ]);

  // ── Step 4: Apply deterministic policy layer ──
  // The policy computes the final risk level and briefing requirement
  // using deterministic rules on top of validated LLM outputs.
  // The LLM's signal detection is trusted, but the policy has the final
  // say on risk level and briefing invocation.
  const policyResult: PolicyResult = applyPolicy({
    signals,
    triageRiskLevel: triageResult.data.riskLevel,
    triageRiskChange: triageResult.data.riskChange,
    humanFollowUpRequired: triageResult.data.humanFollowUpRequired,
    currentRiskLevel: ctx.currentRiskLevel,
    digitalSafety: digitalSafetyResult?.data ?? null,
    message,
  });

  traces.push(buildPolicyTrace(policyResult, signals, ctx.currentRiskLevel));
  traces.push(buildPatternWatchTrace(signals, message, ctx));

  // ── Step 5: Run Briefing (only if policy says so) ──
  // The orchestrator LLM can no longer force a briefing. The policy layer
  // decides based on: signals present, risk changed, or human follow-up needed.
  if (policyResult.briefingRequired) {
    const briefingResult: AgentRunResult<BriefingOutput> = await runAgent({
      agentId: "briefing",
      agentName: "Briefing Agent",
      systemPrompt: BRIEFING_PROMPT,
      userPrompt: briefingUserPrompt(
        ctx,
        triageResult.data.summary,
        aacNudgeResult?.data.nudgeMessage,
        digitalSafetyResult
          ? `${digitalSafetyResult.data.isScam ? "SCAM DETECTED" : "No scam"}: ${digitalSafetyResult.data.warningMessage}`
          : undefined
      ),
      schema: briefingOutputSchema,
      fallback: () => briefingFallback(ctx),
      temperature: 0.5,
      inputSummary: `Summarize observed facts and next actions for caregiver/AAC`,
      stateChanges: ["briefing:created"],
    });
    traces.push(toAgentTrace(briefingResult));
    briefing = enforceBriefingRisk(briefingResult.data, policyResult.finalRisk);
    // NOTE: The briefing LLM's overallRisk is advisory only.
    // The policy layer's finalRisk is authoritative and is NOT overridden.
  }

  // ── Build response ──
  const response: OrchestrateResponse = {
    messages: responseMessages,
    traces,
    alerts: policyResult.alerts,
    riskLevel: policyResult.finalRisk,
    riskChange: policyResult.riskChange,
    signals,
    policy: policyResult,
    briefing,
  };
  Object.defineProperty(response, "contextMemoryCandidates", {
    value: contextMemoryCandidates,
    enumerable: false,
  });
  return response as OrchestrationResult;
}

// ─── Standalone agent runners (for individual API routes) ───

export async function runTriageAgent(
  message: string,
  ctx: AgentRunContext
): Promise<AgentRunResult<TriageOutput>> {
  return runAgent({
    agentId: "triage",
    agentName: "Triage Agent",
    systemPrompt: TRIAGE_PROMPT,
    userPrompt: triageUserPrompt(message, ctx),
    schema: triageOutputSchema,
    fallback: () => triageFallback(ctx),
    temperature: 0.5,
  });
}

export async function runTriageTimelineAgent(
  ctx: AgentRunContext
): Promise<AgentRunResult<TriageTimelineOutput>> {
  return runAgent({
    agentId: "triage",
    agentName: "Triage Agent",
    systemPrompt: TRIAGE_PROMPT,
    userPrompt: triageTimelineUserPrompt(ctx),
    schema: triageTimelineOutputSchema,
    fallback: () => triageTimelineFallback(ctx),
    temperature: 0.3,
    inputSummary: "Extract validated care/safety signals from dated message timeline",
    stateChanges: ["signals:detect_timeline", "risk:suggest_timeline"],
  });
}

export async function runAACNudgeAgent(
  message: string,
  ctx: AgentRunContext,
  signals: TriageSignal[]
): Promise<AgentRunResult<AACNudgeOutput>> {
  return runAgent({
    agentId: "aac_nudge",
    agentName: "AAC Nudge Agent",
    systemPrompt: AAC_NUDGE_PROMPT,
    userPrompt: aacNudgeUserPrompt(message, ctx, signals),
    schema: aacNudgeOutputSchema,
    fallback: aacNudgeFallback,
    temperature: 0.7,
  });
}

export async function runDigitalSafetyAgent(
  message: string,
  ctx: AgentRunContext
): Promise<AgentRunResult<DigitalSafetyOutput>> {
  return runAgent({
    agentId: "digital_safety",
    agentName: "Digital Safety Agent",
    systemPrompt: DIGITAL_SAFETY_PROMPT,
    userPrompt: digitalSafetyUserPrompt(message, ctx),
    schema: digitalSafetyOutputSchema,
    fallback: digitalSafetyFallback,
    temperature: 0.3,
  });
}

export async function runBriefingAgent(
  ctx: AgentRunContext,
  triageResult?: TriageOutput,
  aacNudgeResult?: AACNudgeOutput,
  digitalSafetyResult?: DigitalSafetyOutput
): Promise<AgentRunResult<BriefingOutput>> {
  return runAgent({
    agentId: "briefing",
    agentName: "Briefing Agent",
    systemPrompt: BRIEFING_PROMPT,
    userPrompt: briefingUserPrompt(
      ctx,
      triageResult?.summary,
      aacNudgeResult?.nudgeMessage,
      digitalSafetyResult
        ? `${digitalSafetyResult.isScam ? "SCAM DETECTED" : "No scam"}: ${digitalSafetyResult.warningMessage}`
        : undefined
    ),
    schema: briefingOutputSchema,
    fallback: () => briefingFallback(ctx),
    temperature: 0.5,
  });
}
