// ─── Deterministic Policy Layer ───
// Computes final risk level and briefing requirement using deterministic
// rules applied on top of validated LLM agent outputs.
//
// The LLM handles signal detection and routing. The policy layer has the
// final say on risk level and briefing invocation — it is the safety net
// that prevents LLM inconsistency from causing silent risk failures.

import type { RiskLevel } from "@/lib/types";
import type { TriageSignal, DigitalSafetyOutput } from "./contracts";

// ─── Types ───

export interface PolicyInput {
  /** Signals detected by the Triage Agent (validated, structured). */
  signals: TriageSignal[];
  /** Risk level suggested by the Triage Agent LLM. */
  triageRiskLevel: RiskLevel;
  /** Risk change suggested by the Triage Agent LLM. */
  triageRiskChange: "none" | "increase" | "decrease";
  /** Whether the Triage Agent thinks a human should follow up. */
  humanFollowUpRequired: boolean;
  /** The senior's risk level before this message was processed. */
  currentRiskLevel: RiskLevel;
  /** Output from the Digital Safety Agent, if it ran. */
  digitalSafety?: DigitalSafetyOutput | null;
  /** The original message text (used for keyword-based safety checks). */
  message: string;
}

export interface PolicyResult {
  /** Authoritative final risk level after policy rules. */
  finalRisk: RiskLevel;
  /** Computed risk change: compare finalRisk to currentRiskLevel. */
  riskChange: "none" | "increase" | "decrease";
  /** Whether the Briefing Agent should run. */
  briefingRequired: boolean;
  /** Alerts that should be shown to caregivers/AACs. Signals are broader than alerts. */
  alerts: PolicyAlert[];
  /** Human-readable list of which rules fired. */
  reasoning: string[];
}

export interface PolicyAlert {
  type: TriageSignal["type"];
  message: string;
  severity: TriageSignal["severity"];
  urgent: boolean;
  reason: string;
}

// ─── Helpers ───

const RISK_ORDER: Record<RiskLevel, number> = { green: 0, yellow: 1, red: 2 };

const SEVERITY_ORDER: Record<TriageSignal["severity"], number> = {
  low: 0,
  medium: 1,
  high: 2,
};

function maxRisk(a: RiskLevel, b: RiskLevel): RiskLevel {
  return RISK_ORDER[a] >= RISK_ORDER[b] ? a : b;
}

function hasSignal(
  signals: TriageSignal[],
  type: TriageSignal["type"],
  minSeverity: TriageSignal["severity"]
): boolean {
  return signals.some(
    (s) => s.type === type && SEVERITY_ORDER[s.severity] >= SEVERITY_ORDER[minSeverity]
  );
}

function highestSeverity(signals: TriageSignal[]): TriageSignal["severity"] {
  return signals.reduce<TriageSignal["severity"]>(
    (highest, signal) =>
      SEVERITY_ORDER[signal.severity] > SEVERITY_ORDER[highest]
        ? signal.severity
        : highest,
    "low"
  );
}

function strongestSignal(signals: TriageSignal[]): TriageSignal | null {
  return signals.reduce<TriageSignal | null>((strongest, signal) => {
    if (!strongest) return signal;
    return SEVERITY_ORDER[signal.severity] > SEVERITY_ORDER[strongest.severity]
      ? signal
      : strongest;
  }, null);
}

function compareRisk(
  before: RiskLevel,
  after: RiskLevel
): "none" | "increase" | "decrease" {
  if (RISK_ORDER[after] > RISK_ORDER[before]) return "increase";
  if (RISK_ORDER[after] < RISK_ORDER[before]) return "decrease";
  return "none";
}

// ─── Keyword lists for deterministic safety checks ───
// These are NOT scripted message matching — they are safety-net keyword
// checks that run on top of LLM signal detection. The LLM still does the
// primary analysis; these catch cases where the LLM under-assesses risk.

const EMERGENCY_KEYWORDS: string[] = [
  "chest pain",
  "can't breathe",
  "cannot breathe",
  "difficulty breathing",
  "unconscious",
  "passed out",
  "fainted",
  "collapse",
  "collapsed",
  "severe bleeding",
  "stroke",
  "heart attack",
  "suicide",
  "kill myself",
  "not breathing",
  "choking",
  "severe pain",
  "fell down",
  "can't move",
  "cannot move",
  "dizzy and",
  "vomiting blood",
];

const URGENT_HEALTH_SIGNAL_TERMS: string[] = [
  "breathing difficulty",
  "difficulty breathing",
  "cannot breathe",
  "can't breathe",
  "chest pain",
  "stroke",
  "heart attack",
  "unconscious",
  "severe bleeding",
  "severe pain",
  "vomiting blood",
];

const MONEY_LOSS_KEYWORDS: string[] = [
  "transferred",
  "already paid",
  "gave my",
  "gave them",
  "sent the",
  "otp",
  "one-time password",
  "bank details",
  "bank account",
  "credit card",
  "card number",
  "lost money",
  "wire",
  "remitted",
  "password",
  "login details",
  "account compromised",
  "hacked",
  "they took",
  "deducted",
];

// ─── Main policy function ───

export function applyPolicy(input: PolicyInput): PolicyResult {
  const {
    signals,
    currentRiskLevel,
    digitalSafety,
    message,
    humanFollowUpRequired,
  } = input;

  const reasoning: string[] = [];
  const alerts: PolicyAlert[] = [];

  // Start with current risk — the policy can only escalate, never
  // automatically de-escalate from a single message.
  let risk: RiskLevel = currentRiskLevel;

  const msgLower = message.toLowerCase();

  // ── Rule: no meaningful signals → preserve current risk ──
  if (signals.length === 0) {
    reasoning.push("No signals detected — preserving current risk");
  }

  // ── Rule: one low social signal → preserve current risk ──
  const onlyLowSocial =
    signals.length === 1 &&
    signals[0].type === "social" &&
    signals[0].severity === "low";
  if (onlyLowSocial) {
    reasoning.push(
      "Only one low-severity social signal — preserving current risk (no escalation)"
    );
  }

  // ── Rule: medium health + medium daily_living → at least Yellow ──
  const hasMediumHealth = hasSignal(signals, "health", "medium");
  const hasMediumDailyLiving = hasSignal(signals, "daily_living", "medium");
  if (hasMediumHealth && hasMediumDailyLiving) {
    risk = maxRisk(risk, "yellow");
    reasoning.push(
      "Medium health + medium daily_living signal → at least Yellow"
    );
  }

  // ── Rule: any high-severity digital_safety signal → at least Yellow ──
  if (hasSignal(signals, "digital_safety", "high")) {
    risk = maxRisk(risk, "yellow");
    reasoning.push("High-severity digital_safety signal → at least Yellow");
  }

  // ── Rule: high-severity health signal → at least Yellow ──
  if (hasSignal(signals, "health", "high")) {
    risk = maxRisk(risk, "yellow");
    reasoning.push("High-severity health signal → at least Yellow");
  }

  // ── Rule: high-severity daily_living signal → at least Yellow ──
  if (hasSignal(signals, "daily_living", "high")) {
    risk = maxRisk(risk, "yellow");
    reasoning.push("High-severity daily_living signal → at least Yellow");
  }

  // ── Rule: Digital Safety Agent confirmed scam → at least Yellow ──
  if (digitalSafety?.isScam) {
    risk = maxRisk(risk, "yellow");
    reasoning.push("Digital Safety Agent confirmed scam → at least Yellow");
  }

  const hasUrgentStructuredHealthSignal = signals.some(
    (signal) =>
      signal.type === "health" &&
      signal.severity === "high" &&
      URGENT_HEALTH_SIGNAL_TERMS.some((term) =>
        signal.description.toLowerCase().includes(term)
      )
  );
  if (hasUrgentStructuredHealthSignal) {
    risk = maxRisk(risk, "red");
    reasoning.push("Urgent validated health signal → Red");
  }

  // ── Fail-safe: immediate danger / severe health emergency → Red ──
  // Raw text is intentionally narrow and secondary. Structured signals remain
  // the primary classifier; these checks catch obvious emergency phrasing.
  const hasEmergencyKeyword = EMERGENCY_KEYWORDS.some((kw) =>
    msgLower.includes(kw)
  );
  if (hasEmergencyKeyword) {
    risk = maxRisk(risk, "red");
    reasoning.push("Emergency keyword detected → Red");
  }

  // Severe health emergency: high health signal + emergency context
  if (hasSignal(signals, "health", "high") && hasEmergencyKeyword) {
    risk = maxRisk(risk, "red");
    reasoning.push("High-severity health signal + emergency context → Red");
  }

  // ── Fail-safe: confirmed money loss or account compromise → Red ──
  // Raw text is used only after Digital Safety has already identified a scam.
  const hasMoneyLossKeyword = MONEY_LOSS_KEYWORDS.some((kw) =>
    msgLower.includes(kw)
  );
  if (digitalSafety?.isScam && hasMoneyLossKeyword) {
    risk = maxRisk(risk, "red");
    reasoning.push(
      "Confirmed scam + money loss / account compromise keyword → Red"
    );
  }

  // ── Rule: risk must not decrease from a single ambiguous message ──
  // Risk never automatically decreases from a single message.
  // De-escalation requires sustained positive context over multiple messages,
  // which is a future enhancement. For now, floor at currentRiskLevel.
  if (RISK_ORDER[risk] < RISK_ORDER[currentRiskLevel]) {
    risk = currentRiskLevel;
    reasoning.push(
      `Risk decrease blocked — staying at ${currentRiskLevel} (single-message de-escalation not allowed)`
    );
  }

  // ── Compute final riskChange ──
  const riskChange = compareRisk(currentRiskLevel, risk);

  // ── Alert requirement ──
  const highSignals = signals.filter((signal) => signal.severity === "high");
  for (const signal of highSignals) {
    alerts.push({
      type: signal.type,
      message: signal.description,
      severity: signal.severity,
      urgent: risk === "red",
      reason: risk === "red"
        ? "High-severity signal with Red risk"
        : "High-severity signal",
    });
  }

  const mediumSignals = signals.filter((signal) => signal.severity === "medium");
  if (highSignals.length === 0 && mediumSignals.length > 0) {
    const shouldAlertMedium =
      mediumSignals.length > 1 || riskChange !== "none" || humanFollowUpRequired;
    if (shouldAlertMedium) {
      const primary = strongestSignal(mediumSignals) ?? mediumSignals[0];
      alerts.push({
        type: primary.type,
        message:
          mediumSignals.length > 1
            ? mediumSignals.map((signal) => signal.description).join(" + ")
            : primary.description,
        severity: highestSeverity(mediumSignals),
        urgent: false,
        reason:
          mediumSignals.length > 1
            ? "Multiple medium-severity signals"
            : riskChange !== "none"
              ? "Medium-severity signal with risk increase"
              : "Medium-severity signal with human follow-up required",
      });
    }
  }

  if (risk === "red" && alerts.length === 0) {
    const primary = strongestSignal(signals);
    alerts.push({
      type: primary?.type ?? "health",
      message: primary?.description ?? "Urgent risk escalation detected",
      severity: "high",
      urgent: true,
      reason: "Red risk requires urgent alert",
    });
  }

  if (risk === "red") {
    for (const alert of alerts) {
      alert.urgent = true;
      alert.severity = "high";
      alert.reason = alert.reason.includes("Red risk")
        ? alert.reason
        : `${alert.reason}; Red risk`;
    }
  }

  // ── Briefing requirement ──
  // Run automatic briefing only when at least one actionable condition is true:
  //   1. there are signals beyond a single low-severity social signal
  //   2. riskChange !== "none"
  //   3. humanFollowUpRequired is true
  //   4. a session-end or explicit briefing event occurs (handled by orchestrator)
  const hasActionableSignal = signals.length > 0 && !onlyLowSocial;
  const briefingRequired =
    hasActionableSignal || riskChange !== "none" || humanFollowUpRequired;

  if (briefingRequired) {
    const reasons: string[] = [];
    if (hasActionableSignal) reasons.push(`${signals.length} actionable signal(s)`);
    if (riskChange !== "none") reasons.push(`risk ${riskChange}`);
    if (humanFollowUpRequired) reasons.push("human follow-up required");
    reasoning.push(`Briefing required (${reasons.join(", ")})`);
  } else if (onlyLowSocial) {
    reasoning.push(
      "No briefing required — single low-severity social signal is tracked without escalation"
    );
  } else {
    reasoning.push("No briefing required — benign message, no signals, no risk change");
  }

  return {
    finalRisk: risk,
    riskChange,
    briefingRequired,
    alerts,
    reasoning,
  };
}
