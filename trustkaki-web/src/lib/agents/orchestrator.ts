import { agentPersonalMemorySchema, contextItemsForMemory } from "@/lib/memory/agentContext";
// ─── Orchestrator: Multi-Agent Orchestration Logic ───
// Triage drafts signals/replies; optional Jev routes specialists, then policy and briefing.

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
import { hasSocialActivityCue, jevIsEnabled, runJevSocialDecision } from "./socialDecision";
import { runJevRoutingShadow, routingShadowTrace } from "./routingShadow";
import { selectSpecialistRouting } from "./specialistRouting";
import { environmentAdvisory, outdoorRequest } from "./environmentAdvisory";

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

function isRecallOnly(message: string): boolean {
  // Recall questions supply no new fact, even if the model requests memory.
  // Check each clause so a separate explicit update remains eligible.
  const clauses = message.split(/[.!?。！？,，;；\n]+/u).map(part => part.trim()).filter(Boolean);
  return clauses.length > 0 && clauses.every(clause =>
    /^(?:[你您](?:还|還)?(?:记得|記得)|(?:do|can|could|would) you (?:remember|recall|tell me)|tell me what\b|what\b.*\b(?:do i|is my|are my)\b)/iu.test(clause) ||
    /^[你您]知道我.{0,50}(?:平时|平時|通常|喜欢|喜歡|偏好|习惯|習慣)/u.test(clause) ||
    /^(?:do|can|could|would) you know\b(?=.*\b(?:i|my)\b)(?=.*\b(?:prefer|like|usually|normally|routine)\b)/iu.test(clause)
  );
}

function shouldExcludeContextMemory(message: string): boolean {
  const normalized = normalizedMessage(message);
  const isBoundedSmallTalk = contextMemoryTextExclusionPatterns.some((pattern) =>
    pattern.test(normalized)
  );
  return (
    !normalized ||
    isRecallOnly(message) ||
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

function capabilityReply(message: string, draft: string, signals: TriageSignal[], ctx: AgentRunContext): string | null {
  const chinese = /\p{Script=Han}/u.test(message) || /\p{Script=Han}/u.test(draft);
  const careConcern = signals.some(signal => signal.type === "health" || signal.type === "daily_living");
  const displayRequest = /\b(?:large|larger|bigger)\s+(?:text|font)|\b(?:increase|enlarge)\b.{0,20}\b(?:text|font)|\b(?:font|text)\b.{0,12}\b(?:larger|bigger)\b|大字体|大字體|看不清小字|放大.{0,6}(?:字|文字)/iu.test(message);
  let reply: string | null = null;
  if (displayRequest) reply = chinese
    ? "我无法在聊天中更改字号。您可以请照顾者帮忙调整设备的显示设置。"
    : "I can't change the text size from this chat. Your caregiver may be able to help with the device's display settings.";
  // shortcut: explicit English/Mandarin requests only; broaden with reviewed paraphrase fixtures.
  const contact = message.trim().match(/^(?:(?:please|can you|could you|would you|will you)\s+)?(tell|notify|message|contact|call|phone)\s+(.+)/iu);
  const recipient = contact?.[2] ?? "";
  const namedContact = [ctx.senior.caregiver, ctx.senior.aacVolunteer].some(name =>
    recipient.toLowerCase() === name.toLowerCase() || recipient.toLowerCase().startsWith(`${name.toLowerCase()} `));
  const namedRecipient = !/^(?:me|you|us|them|it|a|an|the|this|that)\b/iu.test(recipient) && /^\p{Lu}[\p{L}'-]+\b/u.test(recipient);
  const relatedContact = /^(?:(?:my|our)\s+)?(?:daughter|son|wife|husband|sister|brother|caregiver|doctor|volunteer|family)\b/iu.test(recipient);
  const phoneRecipient = relatedContact || namedContact || namedRecipient || /^\+?\d/u.test(recipient) || /^me(?:[?.!]|\s+(?:now|later|tomorrow|today|tonight|back|at)\b|$)/iu.test(recipient);
  const englishContact = contact && (/^(?:notify|message|contact|phone)$/iu.test(contact[1]) ||
    (/^tell$/iu.test(contact[1]) ? relatedContact || namedContact || namedRecipient : phoneRecipient));
  const chineseContact = /^(?:(?:请|請)你?|帮我|幫我|麻烦你|麻煩你|能不能|可以)?(?:帮我|幫我)?(?:通知|联系|聯繫|打电话|打電話|(?:告诉|告訴)(?:我的?)?(?:女儿|女兒|儿子|兒子|照顾者|照顧者|家人))/u.test(message.trim());
  const contactRequest = englishContact || chineseContact;
  if (!reply && contactRequest) reply = chinese
    ? "我可以在这里和您聊天，但无法替您联系别人或传话。请直接联系对方，或请照顾者帮忙。"
    : "I can chat with you here, but I can't place calls or pass messages to others. Please contact the person directly or ask your caregiver for help.";
  const personalMemory = agentPersonalMemorySchema.safeParse(ctx.personalMemory);
  const personalRecall = isRecallOnly(message) && /\b(?:i|my)\b|我/u.test(message.toLowerCase()) &&
    /\b(?:prefer|preference|like|usually|normally|routine|always|favourite|favorite)\b|喜欢|喜歡|偏好|平时|平時|习惯|習慣|通常/iu.test(message);
  if (!reply && personalRecall && (!personalMemory.success || personalMemory.data.status !== "available")) reply = chinese
    ? "我目前无法从可用的个人记忆中确认。" + (careConcern ? "" : "您可以再告诉我吗？")
    : "I can't confirm that from the personal memory available right now." + (careConcern ? "" : " Could you tell me again?");
  // shortcut: English/Mandarin meal offers only; extend with reviewed paraphrase cases.
  if (!reply && /\b(?:breakfast|lunch|dinner|meals?|food|toast|porridge)\b|早餐|午餐|晚餐|饭|飯|餐|吐司|粥/iu.test(message + " " + draft)) {
    const clauses = draft.match(/[^.!?。！？\n,，;；]+(?:[.!?。！？,，;；]+|$)/gu) ?? [];
    const physicalOffers = [
      /\b(?:I(?:\s+(?:can|will|could)|['’]ll)\s+|(?:like|want|need)\s+me\s+to\s+)(?:help\s+(?:you\s+)?(?:to\s+)?)?(?:prepare|cook|deliver|bring(?!\s+up))\b(?![^,;.!?]{0,50}\b(?:meal\s+plans?|menus?|recipes?|shopping\s+lists?)\b)/iu,
      /(?:(?:需要|想要|要不要)我|我(?:可以|能|会|會|来|來))(?:帮|幫)?[你您]?(?:准备|準備|做|煮|送)(?![^，；。！？]{0,20}(?:食谱|食譜|菜单|菜單|计划|計劃|清单|清單))/u,
    ];
    const retained = clauses.filter(clause => !physicalOffers.some(pattern => pattern.test(clause)));
    if (retained.length !== clauses.length) reply = [retained.join("").trim().replace(/[,，;；]$/u, chinese ? "。" : "."), chinese
      ? "我可以在这里讨论饮食选择，但无法替您准备食物或送餐。"
      : "I can discuss food options here, but I can't prepare or deliver meals for you."].filter(Boolean).join(" ");
  }
  // Persistence happens after orchestration, so no save outcome is known here.
  // Extraction alone must not replace a direct conversational answer.
  // Replace only drafts that claim an unverified storage action.
  const claimsMemorySave = /\b(?:I|we)(?:(?:['’](?:ve|ll))|\s+(?:have|will|can))?\s+(?:remember(?:ed)?|sav(?:e|ed)|noted?|stor(?:e|ed)|record(?:ed)?|keep\b.{0,20}\bin mind)\b|\b(?:preference|information|detail|memory)\b.{0,30}\b(?:saved|stored|recorded)\b|我(?:已(?:经|經)?|会|會|可以|将|將)?(?:为您|為您|帮您|幫您)?(?:记住|記住|保存|记下|記下|记录|記錄)/iu.test(draft);
  if (!reply && (claimsMemorySave || /^(?:saved|stored|recorded|noted)\b|^(?:已|已经|已經)(?:保存|记录|記錄|记下|記下)/iu.test(draft.trim()))) reply = chinese
    ? "您刚才告诉我的内容还在这段对话里，但我目前无法确认它是否已保存到长期记忆。"
    : "What you told me is here in our conversation, but I can't confirm that it has been saved for future chats.";
  if (!reply) return null;
  return reply + (careConcern
    ? chinese ? "请向您的照顾者说明您现在的身体状况。您现在需要什么帮助？" : " Please tell your caregiver how you're feeling. What help do you need right now?"
    : "");
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

  const activeRouting = process.env.TRUSTKAKI_JEV_ROUTING_ENABLED === "true";
  const routingRun = runJevRoutingShadow(message, ctx);

  // Triage retains independent care interpretation and the conversation draft.
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

  // History resolves a destination, but cannot itself authorize another check.
  // The semantic classifier must cite a trigger in this current senior turn.
  const outdoorTrigger = triageResult.data.outdoorTrigger?.trim();
  const currentOutdoorTrigger = !!outdoorTrigger && message.includes(outdoorTrigger);
  const outdoorMessage = triageResult.data.outdoorContext === "check" && currentOutdoorTrigger
    ? triageResult.data.outdoorQuery ?? outdoorRequest(message, ctx.messages) ?? message : null;
  signals = triageResult.data.signals;
  const activeObservation = activeRouting ? await routingRun : null;
  const routes = selectSpecialistRouting(activeObservation?.judgment ?? null, {
    digitalSafety: triageResult.data.routing.includes("digital_safety") ||
      signals.some(signal => signal.type === "digital_safety") || hasDigitalSafetyCue(message),
    contextMemory: triageResult.data.routing.includes("context_memory") || mayContainDurableContext(message),
    social: outdoorMessage !== null || hasSocialActivityCue(message) || signals.some(signal => signal.type === "social") || triageResult.data.routing.includes("aac_nudge"),
  }, !shouldExcludeContextMemory(message));

  const runDigitalSafety: Promise<AgentRunResult<DigitalSafetyOutput> | null> =
    routes.digitalSafety
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
    routes.contextMemory
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

  const policyTrace = buildPolicyTrace(policyResult, signals, ctx.currentRiskLevel);
  traces.push(policyTrace);
  traces.push(buildPatternWatchTrace(signals, message, ctx));

  // One selected reply, after authoritative policy; specialist drafts are not concatenated.
  const urgentHealth = hasUrgentHealthConcern(message, signals);
  const safetyReply = digitalSafetyResult && (
    digitalSafetyResult.fallback || digitalSafetyResult.data.isScam ||
    signals.some(signal => signal.type === "digital_safety") || hasDigitalSafetyCue(message) ||
    routes.requestedSpecialists.includes("digital_safety")
  );
  const boundedReply = capabilityReply(message, triageResult.data.responseMessage, signals, ctx);
  const triageCare = signals.some(signal => signal.type === "health" || signal.type === "daily_living");
  const socialEligible = !urgentHealth && !safetyReply && !boundedReply && policyResult.finalRisk !== "red" && !triageCare && routes.social;
  const careClarification = socialEligible && routes.carePause
    ? /\p{Script=Han}/u.test(message) || /\p{Script=Han}/u.test(triageResult.data.responseMessage)
      ? "在讨论活动之前，您现在需要什么帮助？"
      : "Before discussing activities, what help do you need right now?"
    : null;
  // Weather is factual context, not an activity invitation: a nonurgent care
  // pause must not hide conditions relevant to an already stated outdoor plan.
  const environment = !urgentHealth && !safetyReply && !boundedReply &&
      policyResult.finalRisk !== "red" && outdoorMessage !== null
    ? await environmentAdvisory(outdoorMessage!, ctx.senior.address) : null;
  // A conditions-only turn must use checked tool evidence, not the earlier
  // model draft (which has not seen those readings and may guess about haze).
  const careReply = careClarification ?? (triageCare ? triageResult.data.responseMessage : null);
  const environmentReply = environment
    ? careReply ? `${careReply}\n\n${environment.reply}` : environment.reply
    : undefined;
  if (environment) {
    if (triageCare || routes.carePause) environment.trace.tags.push("care_reply_preserved");
    traces.push(environment.trace);
  }
  const socialDecision = !environment && jevIsEnabled() && socialEligible && !routes.carePause
      ? await runJevSocialDecision(message) : null;
  if (socialDecision) {
    socialDecision.tags.push("reply_selected");
    traces.push(toAgentTrace(socialDecision));
  }
  if (!urgentHealth && !safetyReply && boundedReply) policyTrace.tags.push("capability_bound_reply");
  responseMessages.push(urgentHealth
    ? { text: "Your message may need urgent help. Please seek immediate help from local emergency services or someone nearby. I cannot contact them for you.\n\n您的情况可能需要紧急帮助。请立即联系当地急救服务或身边的人求助。我无法替您联系他们。", agentId: "policy" }
    : safetyReply
      ? { text: routes.requestedSpecialists.includes("digital_safety") && !digitalSafetyResult.data.isScam
        ? /\p{Script=Han}/u.test(message)
          ? "我无法确认这条信息是否安全。请先不要分享验证码、密码或转账，并请可信任的人帮忙核实。"
          : "I can't verify whether this request is safe. Avoid sharing codes, passwords or money, and ask someone you trust to help check it."
        : digitalSafetyResult.data.warningMessage, agentId: "digital_safety" }
      : boundedReply
        ? { text: boundedReply, agentId: "policy" }
        : environmentReply
          ? { text: environmentReply, agentId: triageCare ? "triage" : routes.carePause ? "policy" : "aac_nudge" }
        : careClarification
          ? { text: careClarification, agentId: "policy" }
        : socialDecision
          ? { text: socialDecision.data.nudgeMessage, agentId: "aac_nudge" }
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
  const routingObservation = activeObservation ?? await routingRun;
  if (routingObservation) traces.push(routingShadowTrace(routingObservation, triageResult, {
    requestedSpecialists: routes.requestedSpecialists, independentTriggers: routes.independentTriggers,
    executedSpecialists: [...(digitalSafetyResult ? ["digital_safety" as const] : []),
      ...(contextMemoryResult ? ["context_memory" as const] : []), ...(socialDecision || environment ? ["aac_nudge" as const] : [])],
    carePause: routes.carePause,
    blockedReasons: {
      ...(!routes.contextMemory && (routes.requestedSpecialists.includes("context_memory") || routes.independentTriggers.includes("context_memory"))
        ? { context_memory: "memory_exclusion" } : {}),
      ...(routes.social && !socialDecision && !environment ? { aac_nudge: urgentHealth ? "urgent_priority" : safetyReply ? "safety_priority"
        : boundedReply ? "capability_priority" : policyResult.finalRisk === "red" ? "red_risk"
          : triageCare || routes.carePause ? "care_priority" : "social_disabled" } : {}),
    },
  }));
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
  if (jevIsEnabled()) return runJevSocialDecision(message, {
    boundedReply: capabilityReply(message, "", signals, ctx),
    carePriority: ctx.currentRiskLevel === "red" || hasUrgentHealthConcern(message, signals) || hasDigitalSafetyCue(message) ||
      signals.some(signal => signal.type === "health" || signal.type === "daily_living" || signal.type === "digital_safety"),
  });
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
