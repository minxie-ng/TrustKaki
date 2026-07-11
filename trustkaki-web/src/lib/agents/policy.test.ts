import { describe, expect, it } from "vitest";
import { applyPolicy } from "./policy";
import type { DigitalSafetyOutput, TriageSignal } from "./contracts";

const signal = (
  type: TriageSignal["type"],
  severity: TriageSignal["severity"],
  description = `${severity} ${type}`
): TriageSignal => ({ type, severity, description });

const scam = (
  overrides: Partial<DigitalSafetyOutput> = {}
): DigitalSafetyOutput => ({
  isScam: true,
  scamType: "phishing",
  confidence: 0.9,
  warningMessage: "Do not click.",
  educationalNote: "Verify through official channels.",
  ...overrides,
});

describe("applyPolicy", () => {
  it("keeps a benign greeting green without briefing or alerts", () => {
    const result = applyPolicy({
      signals: [],
      triageRiskLevel: "green",
      triageRiskChange: "none",
      humanFollowUpRequired: false,
      currentRiskLevel: "green",
      digitalSafety: null,
      message: "Good morning, I slept well.",
    });

    expect(result.finalRisk).toBe("green");
    expect(result.riskChange).toBe("none");
    expect(result.briefingRequired).toBe(false);
    expect(result.alerts).toEqual([]);
  });

  it("escalates medium health plus medium daily living to yellow with one actionable alert", () => {
    const result = applyPolicy({
      signals: [
        signal("health", "medium", "Knee pain reported"),
        signal("daily_living", "medium", "Skipped breakfast"),
      ],
      triageRiskLevel: "green",
      triageRiskChange: "none",
      humanFollowUpRequired: false,
      currentRiskLevel: "green",
      digitalSafety: null,
      message: "Not hungry today. Knee pain.",
    });

    expect(result.finalRisk).toBe("yellow");
    expect(result.riskChange).toBe("increase");
    expect(result.briefingRequired).toBe(true);
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      type: "health",
      severity: "medium",
      urgent: false,
    });
  });

  it("does not brief or alert for one low social paiseh signal by default", () => {
    const result = applyPolicy({
      signals: [signal("social", "low", "Reluctant to join AAC activity")],
      triageRiskLevel: "green",
      triageRiskChange: "none",
      humanFollowUpRequired: false,
      currentRiskLevel: "green",
      digitalSafety: null,
      message: "Don't want. Paiseh.",
    });

    expect(result.finalRisk).toBe("green");
    expect(result.briefingRequired).toBe(false);
    expect(result.alerts).toEqual([]);
  });

  it("escalates high digital safety to at least yellow and creates an alert", () => {
    const result = applyPolicy({
      signals: [signal("digital_safety", "high", "Suspicious SingPost link")],
      triageRiskLevel: "green",
      triageRiskChange: "none",
      humanFollowUpRequired: false,
      currentRiskLevel: "green",
      digitalSafety: scam({ confidence: 0.7 }),
      message:
        "[Forwarded SMS] SingPost: Your parcel is held. Click bit.ly/sp-post-fake",
    });

    expect(result.finalRisk).toBe("yellow");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      type: "digital_safety",
      severity: "high",
      urgent: false,
    });
  });

  it("does not escalate high-confidence phishing to red without loss or account compromise", () => {
    const result = applyPolicy({
      signals: [signal("digital_safety", "high", "Suspicious SingPost link")],
      triageRiskLevel: "yellow",
      triageRiskChange: "increase",
      humanFollowUpRequired: true,
      currentRiskLevel: "green",
      digitalSafety: scam({ confidence: 0.95 }),
      message:
        "[Forwarded SMS] SingPost: Your parcel is held. Click to reschedule delivery: bit.ly/sp-post-fake",
    });

    expect(result.finalRisk).toBe("yellow");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      type: "digital_safety",
      severity: "high",
      urgent: false,
    });
  });

  it("escalates urgent structured health signals to red with an urgent alert", () => {
    const result = applyPolicy({
      signals: [signal("health", "high", "Severe breathing difficulty")],
      triageRiskLevel: "yellow",
      triageRiskChange: "increase",
      humanFollowUpRequired: true,
      currentRiskLevel: "green",
      digitalSafety: null,
      message: "I cannot breathe and have chest pain.",
    });

    expect(result.finalRisk).toBe("red");
    expect(result.riskChange).toBe("increase");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0]).toMatchObject({
      type: "health",
      severity: "high",
      urgent: true,
    });
  });

  it("uses urgent validated health signal descriptions before raw message fallback", () => {
    const result = applyPolicy({
      signals: [signal("health", "high", "Severe breathing difficulty")],
      triageRiskLevel: "red",
      triageRiskChange: "increase",
      humanFollowUpRequired: true,
      currentRiskLevel: "green",
      digitalSafety: null,
      message: "Please help me.",
    });

    expect(result.finalRisk).toBe("red");
    expect(result.alerts).toHaveLength(1);
    expect(result.alerts[0].urgent).toBe(true);
  });

  it("escalates confirmed scam loss or account compromise to red", () => {
    const result = applyPolicy({
      signals: [signal("digital_safety", "high", "Bank credential scam")],
      triageRiskLevel: "yellow",
      triageRiskChange: "increase",
      humanFollowUpRequired: true,
      currentRiskLevel: "green",
      digitalSafety: scam(),
      message: "I already gave them my OTP and bank details.",
    });

    expect(result.finalRisk).toBe("red");
    expect(result.alerts.some((alert) => alert.urgent)).toBe(true);
  });

  it("does not decrease yellow risk after one positive message", () => {
    const result = applyPolicy({
      signals: [],
      triageRiskLevel: "green",
      triageRiskChange: "decrease",
      humanFollowUpRequired: false,
      currentRiskLevel: "yellow",
      digitalSafety: null,
      message: "I feel okay today.",
    });

    expect(result.finalRisk).toBe("yellow");
    expect(result.riskChange).toBe("none");
    expect(result.briefingRequired).toBe(false);
  });
});
