import type { OrchestrationResult } from "../src/lib/agents/contracts";
import { fictionalRoutingContext } from "../src/lib/agents/evaluation/routingShadow";
import { wholeFlowCases, wholeFlowChecks } from "./whole-flow-shadow-cases";

const extra = [
  { id: "implicit_scam", message: "They say my payout expires tonight unless I send the six digits from my banking app." },
  { id: "indirect_preference", message: "For important updates, Mandarin voice calls work best for me, every time." },
  { id: "benign_recipe", message: "Can you help me plan breakfast? A recipe is enough; I will cook it myself." },
  { id: "contextual_social", message: "That sounds nice. I'd like to hear the options." },
].map(item => {
  const context = fictionalRoutingContext();
  context.messages = item.id === "contextual_social"
    ? [{ id: "fictional-prior-offer", sender: "trustkaki" as const, text: "Would you like to hear about one-to-one social activities?", timestamp: "2026-10-16T00:00:00.000Z" }]
    : [];
  context.messages.push({ id: `fictional-${item.id}`, sender: "senior", text: item.message, timestamp: "2026-10-16T00:01:00.000Z" });
  return { ...item, context };
});

// Recall evidence is supplied by the fictional corpus; this runner never queries the live memory database.
export const activeFlowCases = [...wholeFlowCases, ...extra];

// Lightweight screens, not a substitute for reviewing every selected fictional reply.
export function activeFlowChecks(caseId: string, result: OrchestrationResult) {
  const text = result.messages[0]?.text ?? "";
  const routing = result.traces.find(t => t.agentName === "Jev Specialist Router");
  const judgment = routing ? JSON.parse(routing.output).jevJudgment : null;
  const recall = ["grounded_recall", "unavailable_memory"].includes(caseId);
  return {
    ...wholeFlowChecks(caseId, result),
    recallNotExtracted: !recall || !result.traces.some(t => t.agentId === "context_memory"),
    noObservedMealPromise: !/需要我帮你准备|would you like me to prepare|I can cook.{0,25}for you/iu.test(text),
    mixedCareClarification: caseId !== "mixed_preference" || /\?|？/u.test(text),
    implicitScamAssessed: caseId !== "implicit_scam" || result.traces.some(t => t.agentId === "digital_safety"),
    indirectPreferenceProposed: caseId !== "indirect_preference" || result.contextMemoryCandidates.some(c =>
      c.contextType === "communication_preference" && /Mandarin|华语|華語|普通话|普通話/u.test(c.content)),
    benignRecipeNoCareSignal: caseId !== "benign_recipe" || !result.signals.some(s => s.type === "health" || s.type === "daily_living"),
    benignRecipeNoCareRouting: caseId !== "benign_recipe" || !judgment ||
      [judgment.health, judgment.daily_living, judgment.urgent].every(label => label === "absent"),
    contextualSocialRecognized: caseId !== "contextual_social" || !routing || judgment?.social === "present",
  };
}
