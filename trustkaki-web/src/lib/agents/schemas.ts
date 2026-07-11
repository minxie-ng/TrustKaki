// ─── Zod Schemas for Agent Output Validation ───

import { z } from "zod";

export const riskLevelSchema = z.enum(["green", "yellow", "red"]);
export const agentIdSchema = z.enum([
  "orchestrator",
  "triage",
  "policy",
  "daily_living",
  "health_frailty",
  "aac_nudge",
  "digital_safety",
  "briefing",
  "pattern_watch",
]);

export const triageSignalSchema = z.object({
  type: z.enum(["health", "daily_living", "digital_safety", "social"]),
  category: z
    .enum([
      "daily_living",
      "health_frailty_signal",
      "social_isolation",
      "digital_safety",
      "caregiver_aac_escalation",
      "emergency_high_risk",
    ])
    .optional(),
  description: z.string().min(1),
  severity: z.enum(["low", "medium", "high"]),
});

export const agentRunContextSchema = z.object({
  senior: z.object({
    name: z.string().min(1),
    age: z.number(),
    livingSituation: z.string().min(1),
    caregiver: z.string().min(1),
    aacVolunteer: z.string().min(1),
  }),
  messages: z.array(
    z.object({
      id: z.string().min(1),
      sender: z.enum(["senior", "trustkaki", "system"]),
      text: z.string(),
      timestamp: z.string(),
      agentId: agentIdSchema.optional(),
    })
  ),
  currentRiskLevel: riskLevelSchema,
});

export const orchestratorInputSchema = z.object({
  message: z.string().min(1),
  context: agentRunContextSchema,
});

export const orchestratorOutputSchema = z.object({
  agentsToRun: z.array(z.string()),
  priority: z.record(z.string(), z.enum(["high", "medium", "low"])),
  reasoning: z.string().min(1),
});

export const triageOutputSchema = z.object({
  signals: z.array(triageSignalSchema),
  riskLevel: riskLevelSchema,
  riskChange: z.enum(["none", "increase", "decrease"]),
  confidence: z.number().min(0).max(1).optional(),
  routing: z.array(z.string()),
  summary: z.string().min(1),
  responseMessage: z.string().min(1),
  humanFollowUpRequired: z.boolean(),
  recommendedAction: z.string().optional(),
});

export const triageTimelineOutputSchema = z.object({
  messages: z.array(
    z.object({
      messageId: z.string().min(1),
      signals: z.array(triageSignalSchema),
      riskLevel: riskLevelSchema,
      summary: z.string().min(1),
      humanFollowUpRequired: z.boolean(),
      recommendedAction: z.string().optional(),
    })
  ),
  overallRiskLevel: riskLevelSchema,
  summary: z.string().min(1),
});

export const aacNudgeOutputSchema = z.object({
  nudgeMessage: z.string().min(1),
  approach: z.string().min(1),
  rationale: z.string().min(1),
  suggestedChannel: z.enum(["whatsapp", "call", "in_person"]),
});

export const digitalSafetyOutputSchema = z.object({
  isScam: z.boolean(),
  scamType: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  warningMessage: z.string().min(1),
  educationalNote: z.string().min(1),
});

export const briefingOutputSchema = z.object({
  forCaregiver: z.string().min(1),
  forAACVolunteer: z.string().min(1),
  overallRisk: riskLevelSchema,
  keyConcerns: z.array(z.string()),
  recommendedActions: z.array(z.string()),
});
