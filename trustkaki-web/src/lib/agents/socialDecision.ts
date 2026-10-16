import { randomUUID } from "node:crypto";
import type { AACNudgeOutput, AgentRunResult } from "./contracts";
import { buildJevSocialIntentRequest, OPENROUTER_JEV_ENDPOINT, parseJevSocialIntent, type SocialIntent } from "./socialIntentContract";

export const JEV_SOCIAL_MODEL = "typesafe/jev-1.14";
export function jevIsEnabled(): boolean {
  return process.env.TRUSTKAKI_JEV_ENABLED === "true";
}

export function hasSocialActivityCue(message: string): boolean {
  // Eligibility only; never interpret this lexical guard as interest or consent.
  return /\b(?:activit(?:y|ies)|outings?|chess|mahjong|clubs?|one[- ]to[- ]one|social|lonel(?:y|iness)|groups?)\b|活动|活動|探访|探訪|象棋|麻将|麻將|孤独|孤獨|小组|小組/iu.test(message);
}

export interface SocialDecisionOutput extends AACNudgeOutput { socialIntent: SocialIntent | null }

function reply(label: SocialIntent | null, chinese: boolean): string {
  if (label === "interested") return chinese
    ? "您比较喜欢一对一交流，还是小组活动？我无法确认本地活动是否有名额，也无法代为预约。"
    : "Would you prefer something one-to-one or a small group? I can't confirm local availability or make bookings.";
  if (label === "declining") return chinese
    ? "好的，我们先不再推荐活动，尊重您的决定。"
    : "Of course. We can leave activities for now. I respect your decision.";
  if (label === "unclear") return chinese
    ? "您想了解活动选择，还是暂时不谈活动？都可以。"
    : "Would you like help exploring activities, or would you prefer to leave that for now? Either is okay.";
  return chinese ? "我暂时无法确认您的活动意愿，我们先不谈活动。"
    : "I couldn't check your activity preferences right now. We can leave activities for now.";
}

export async function runJevSocialDecision(message: string, options: { carePriority?: boolean; boundedReply?: string | null } = {}): Promise<AgentRunResult<SocialDecisionOutput>> {
  const start = performance.now();
  const timestamp = new Date().toISOString();
  let label: SocialIntent | null = null;
  let modelUsed = "none";
  let errorMessage: string | null = null;
  let confidence: number | null = null;
  try {
    if (options.boundedReply) throw new Error("jev_capability_priority");
    if (options.carePriority) throw new Error("jev_care_priority");
    if (!jevIsEnabled()) throw new Error("jev_disabled");
    const apiKey = process.env.OPENROUTER_API_KEY?.trim();
    if (!apiKey) throw new Error("jev_not_configured");
    const payload = { ...buildJevSocialIntentRequest(message), model: JEV_SOCIAL_MODEL };
    const response = await fetch(OPENROUTER_JEV_ENDPOINT, {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(3000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(payload),
    });
    if (!response.ok) { await response.body?.cancel(); throw new Error("jev_provider_unavailable"); }
    const parsed = parseJevSocialIntent(await response.json());
    if (!/^typesafe\/jev-1\.14(?:[-.]\d+)*$/.test(parsed.model)) throw new Error("jev_invalid_output");
    label = parsed.label;
    modelUsed = parsed.model;
    confidence = parsed.confidence;
  } catch (error) {
    // Only our fixed error codes are safe for persisted traces; never forward provider bodies.
    errorMessage = error instanceof Error && /^jev_(?:disabled|not_configured|provider_unavailable|invalid_output|care_priority|capability_priority)$/.test(error.message)
      ? error.message : "jev_decision_unavailable";
  }
  const summary = options.boundedReply ? "Requested action exceeds chat capabilities; no activity suggestion made."
    : options.carePriority ? "Activity discussion paused; care or safety review takes priority."
    : label === "interested" ? "Interested in exploring activities; no booking or contact authorized."
    : label === "declining" ? "Activity suggestion stopped to respect refusal."
    : label === "unclear" ? "Interest unclear; clarification needed before suggesting an activity."
    : "Jev decision unavailable; no activity suggestion made.";
  const chinese = /\p{Script=Han}/u.test(message);
  const data: SocialDecisionOutput = { socialIntent: label, nudgeMessage: options.boundedReply ?? (options.carePriority
    ? chinese ? "我们先不谈活动，优先关注您的照护或安全问题。" : "Let's pause activities and focus on your care or safety concern."
    : reply(label, chinese)),
    approach: "Respect current activity preference", rationale: summary, suggestedChannel: "whatsapp" };
  return {
    agentId: "aac_nudge", agentName: "Jev Social Decision", traceId: `trace_jev_${randomUUID()}`, timestamp,
    input: JSON.stringify({ currentMessageCharacters: message.length }),
    reasoning: summary, output: JSON.stringify({ socialIntent: label, confidence, summary }), tags: ["social_decision", label ?? "unavailable"],
    data, durationMs: performance.now() - start, modelUsed, fallback: label === null,
    inputSummary: "Current message reviewed for willingness to explore social activities.", outputSummary: summary,
    stateChanges: [], errorMessage,
  };
}
