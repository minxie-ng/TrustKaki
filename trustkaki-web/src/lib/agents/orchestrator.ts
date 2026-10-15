import { contextItemsForMemory } from "@/lib/memory/agentContext";
// ─── Orchestrator: Multi-Agent Orchestration Logic ───
// Triage owns conversation/routing; conditional safety/memory, policy, then briefing.

import type { AgentId, AgentTrace } from "@/lib/types";
import type {
  AgentRunContext,
  AgentRunResult,
  OrchestrateResponse,
  OrchestrationResult,
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
  triageOutputSchema,
  triageTimelineOutputSchema,
  aacNudgeOutputSchema,
  digitalSafetyOutputSchema,
  briefingOutputSchema,
  contextMemoryOutputSchema,
} from "./schemas";
import { runAgent, toAgentTrace } from "./runner";
import { applyPolicy, hasUrgentHealthConcern } from "./policy";
import type { PolicyResult } from "./policy";
import { evaluatePatternWatch, type PatternSignal } from "@/lib/patterns/patternWatch";
import {
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
  /^(?:你好|您好|早安|早上好|晚上好|谢谢|谢谢你|好的|好|再见)$/u,
  /^(?:hi|hello|hey)(?: there|(?: [a-z'-]+){1,2})?$/,
  /^(?:good (?:morning|afternoon|evening)|ok|okay|how are you|have a nice day)$/,
  /^(?:ok |okay )?(?:thanks|thank you)(?: so much| very much)?$/,
  /^(?:the weather is (?:nice|lovely|good|hot|rainy)(?: today)?|(?:nice|lovely|good|hot|rainy) weather(?: today)?(?: isn't it| is it not)?)$/,
] as const;
const phoneNumberPattern = /\+?\d(?:[\s().-]*\d){7,}/g;
const prohibitedMemoryDataPatterns = [
  /(?:密码|密碼|验证码|驗證碼|一次性密碼|银行卡号|銀行卡號|银行账号|銀行賬號|身份证号|身份證號)\s*(?:是|为|為|:|：|=)?\s*[a-z0-9-]{3,}/gi,
  /\b(?:otp|one[- ]time (?:password|pin|code)|pin)\s*(?:(?:is|:|=)\s*)?\d{4,12}\b/gi,
  /\b(?:password|passcode|credentials?)\s*(?:is|are|:|=)\s*[^\s,.;]{4,}/gi,
  /\b(?:password|passcode|credentials?)\s+(?=[^\s,.;]*[^a-z\s,.;])[^\s,.;]{4,}/gi,
  /\b(?:cvv|cvc|security[- ]code)\s*(?:(?:is|:|=)\s*)?\d{3,4}\b/gi,
  /\b(?:bank\s+)?account(?:\s+(?:number|no\.?))?\s*(?:is|:|=)?\s*\d(?:[\s-]*\d){5,}/gi,
  /\b(?:credit|debit|bank)\s+card(?:\s+(?:number|no\.?))?\s*(?:is|:|=)?\s*\d(?:[\s-]*\d){7,}/gi,
  /\b(?:nric|passport|identity(?: document| card)?|national id)(?:\s+(?:number|no\.?))?\s*(?:is|:|=)?\s*[a-z0-9-]{6,}/gi,
] as const;
const REDACTED_PROHIBITED_DATA = "[REDACTED_PROHIBITED_DATA]";
const durableContextPatterns = [
  /(?:喜欢|喜歡|偏好|习惯|習慣|宁愿|寧願).{0,35}(?:华语|華語|中文|普通话|普通話|英语|英語|电话|電話|通话|通話|短信|语音|語音|活动|活動|一对一|一對一|吃|睡|散步)/u,
  /(?:每天|每早|通常|每周|每週|一直).{0,35}(?:早餐|吃|睡|起床|散步|运动|運動|打电话|打電話)/u,
  /(?:大字体|大字體|看不清小字|听不清|聽不清|轮椅|輪椅|助听器|助聽器)/u,
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
    .replace(/[^\p{L}\p{N}\s'-]/gu, "")
    .replace(/\s+/g, " ");
}

function redactProhibitedMemoryData(value: string): string {
  const withoutPhoneNumbers = value.replace(phoneNumberPattern, (match) =>
    isSupportedCalendarDate(match) ? match : REDACTED_PROHIBITED_DATA
  );
  return prohibitedMemoryDataPatterns.reduce(
    (redacted, pattern) => redacted.replace(pattern, REDACTED_PROHIBITED_DATA),
    withoutPhoneNumbers
  );
}

function isSupportedCalendarDate(value: string): boolean {
  const yearFirst = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const dayFirst = value.match(/^(\d{2})([-/])(\d{2})\2(\d{4})$/);
  if (!yearFirst && !dayFirst) return false;

  const year = Number(yearFirst?.[1] ?? dayFirst?.[4]);
  const month = Number(yearFirst?.[2] ?? dayFirst?.[3]);
  const day = Number(yearFirst?.[3] ?? dayFirst?.[1]);
  if (year < 1900 || year > 2100) return false;

  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
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
    activeContext: contextItemsForMemory(ctx)
      .filter(
        (item): item is typeof item & {
          targetStore: NonNullable<typeof item.targetStore>;
          contextKey: string;
        } => Boolean(item.targetStore && item.contextKey)
      )
      .slice(0, 12)
      .map((item) => ({
        targetStore: item.targetStore,
        contextKey: item.contextKey,
        summary: item.content,
      })),
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

function triageFallback(ctx: AgentRunContext): TriageOutput {
  return {
    signals: [],
    riskLevel: ctx.currentRiskLevel,
    riskChange: "none",
    routing: [],
    summary:
      "Unable to analyze message automatically. Manual review recommended.",
    responseMessage:
      "I'm having trouble understanding this message right now. Could you tell me a little more?",
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
      "We can leave activities for now. You can tell me if you'd like to explore an option later.",
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
      "I couldn't fully check this message. If it has a link and you're not sure, please don't click it or share private codes. Check through a trusted official channel.",
    educationalNote:
      "Use contact details you already trust, rather than those supplied in the suspicious message.",
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

function hasDigitalSafetyCue(message: string): boolean {
  // Bounded guard supplements Triage; this is not a general scam detector.
  return /https?:\/\/|www\.|bit\.ly|tinyurl|\b(?:otp|one[- ]time password|phishing|scam|suspicious link|investment scheme)\b|验证码|驗證碼|诈骗|詐騙|可疑链接|可疑連結/i.test(message) ||
    prohibitedMemoryDataPatterns.some(pattern => message.search(pattern) >= 0);
}

function digitalSafetySummary(data?: DigitalSafetyOutput): string | undefined {
  if (!data) return undefined;
  return `${data.isScam ? "Suspected scam" : "Assessment inconclusive; safety is not verified"}; reported confidence=${data.confidence}: ${data.warningMessage}`;
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

  // Triage owns primary interpretation, routing and the conversation draft.
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

  const runDigitalSafety: Promise<AgentRunResult<DigitalSafetyOutput> | null> =
    triageResult.data.routing.includes("digital_safety") ||
    signals.some(signal => signal.type === "digital_safety") ||
    hasDigitalSafetyCue(message)
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
        })
      : Promise.resolve(null);

  const contextMemoryExecution: {
    input: ContextMemoryInput | null;
    promise: Promise<AgentRunResult<ContextMemoryOutput> | null>;
  } =
    !shouldExcludeContextMemory(message) &&
    (triageResult.data.routing.includes("context_memory") || mayContainDurableContext(message))
      ? (() => {
          const input = contextMemoryInput(message, ctx);
          return {
            input,
            promise: runAgent({
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
            }),
          };
        })()
      : { input: null, promise: Promise.resolve(null) };

  const [digitalSafetyResult, contextMemoryResult] =
    await Promise.all([
      runDigitalSafety,
      contextMemoryExecution.promise,
    ]);

  if (digitalSafetyResult) traces.push(toAgentTrace(digitalSafetyResult));
  if (contextMemoryResult && contextMemoryExecution.input) {
    traces.push(
      contextMemoryTrace(contextMemoryResult, contextMemoryExecution.input)
    );
    contextMemoryCandidates = contextMemoryResult.data.candidates;
  }

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

  // One selected reply, after authoritative policy; specialist drafts are not concatenated.
  const urgentHealth = hasUrgentHealthConcern(message, signals);
  const safetyReply = digitalSafetyResult && (
    digitalSafetyResult.fallback || digitalSafetyResult.data.isScam ||
    signals.some(signal => signal.type === "digital_safety") || hasDigitalSafetyCue(message)
  );
  responseMessages.push(urgentHealth
    ? { text: "Your message may need urgent help. Please seek immediate help from local emergency services or someone nearby. I cannot contact them for you.\n\n您的情况可能需要紧急帮助。请立即联系当地急救服务或身边的人求助。我无法替您联系他们。", agentId: "policy" }
    : safetyReply
      ? { text: digitalSafetyResult.data.warningMessage, agentId: "digital_safety" }
      : { text: triageResult.data.responseMessage, agentId: "triage" });

  // ── Step 5: Run Briefing (only if policy says so) ──
  // The orchestrator LLM can no longer force a briefing. The policy layer
  // decides based on: signals present, risk changed, or human follow-up needed.
  if (policyResult.briefingRequired) {
    const briefingResult: AgentRunResult<BriefingOutput> = await runAgent({
      agentId: "briefing",
      agentName: "Briefing Agent",
      systemPrompt: BRIEFING_PROMPT,
      userPrompt: briefingUserPrompt(
        { ...ctx, currentRiskLevel: policyResult.finalRisk },
        triageResult.data.summary,
        undefined,
        digitalSafetySummary(digitalSafetyResult?.data),
        {
          finalRisk: policyResult.finalRisk,
          signals,
          triageStatus: triageResult.fallback ? "unavailable" : "available",
          digitalSafetyStatus: digitalSafetyResult?.fallback ? "unavailable"
            : digitalSafetyResult ? "available" : "not_requested",
          selectedReply: responseMessages[0].text,
        }
      ),
      schema: briefingOutputSchema,
      fallback: () => briefingFallback({ ...ctx, currentRiskLevel: policyResult.finalRisk }),
      temperature: 0.5,
      inputSummary: `Summarize observed facts and next actions for caregiver/AAC`,
      stateChanges: ["briefing:created"],
    });
    if (briefingResult.data.overallRisk !== policyResult.finalRisk) {
      briefing = briefingFallback({ ...ctx, currentRiskLevel: policyResult.finalRisk });
      traces.push(toAgentTrace({
        ...briefingResult,
        data: briefing,
        output: JSON.stringify(briefing),
        outputSummary: "Briefing rejected because its risk conflicts with final policy; manual review required",
        fallback: true,
        tags: [...briefingResult.tags, "policy_risk_mismatch"],
        errorMessage: "briefing_policy_risk_mismatch",
      }));
    } else {
      briefing = briefingResult.data;
      traces.push(toAgentTrace(briefingResult));
    }
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
      digitalSafetySummary(digitalSafetyResult)
    ),
    schema: briefingOutputSchema,
    fallback: () => briefingFallback(ctx),
    temperature: 0.5,
  });
}
