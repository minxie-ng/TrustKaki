// ─── Orchestrator: Multi-Agent Orchestration Logic ───
// Chains: triage → (aac_nudge | digital_safety in parallel) → briefing

import type { AgentId, AgentTrace } from "@/lib/types";
import type {
  AgentRunContext,
  AgentRunResult,
  OrchestrateResponse,
  OrchestratorOutput,
  TriageOutput,
  TriageTimelineOutput,
  TriageSignal,
  AACNudgeOutput,
  DigitalSafetyOutput,
  BriefingOutput,
} from "./contracts";
import {
  orchestratorOutputSchema,
  triageOutputSchema,
  triageTimelineOutputSchema,
  aacNudgeOutputSchema,
  digitalSafetyOutputSchema,
  briefingOutputSchema,
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
} from "./prompts";

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
): Promise<OrchestrateResponse> {
  const traces: AgentTrace[] = [];
  const responseMessages: Array<{ text: string; agentId?: AgentId }> = [];
  let signals: TriageSignal[] = [];
  let briefing: BriefingOutput | null = null;

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

  const [aacNudgeResult, digitalSafetyResult] = await Promise.all([
    runAACNudge,
    runDigitalSafety,
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
  return {
    messages: responseMessages,
    traces,
    alerts: policyResult.alerts,
    riskLevel: policyResult.finalRisk,
    riskChange: policyResult.riskChange,
    signals,
    policy: policyResult,
    briefing,
  };
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
