// ─── Zod Schemas for Agent Output Validation ───

import { z } from "zod";
import {
  memoryApplicationTags,
  memoryContextTypes,
  memoryRetentionClasses,
  memoryTargetStores,
} from "@/lib/memory/contracts";

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
  "context_memory",
  "pattern_watch",
]);

export const specialistAgentIdSchema = z.enum([
  "triage",
  "aac_nudge",
  "digital_safety",
  "context_memory",
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
  description: z.string().min(1).max(1000),
  severity: z.enum(["low", "medium", "high"]),
});

export const agentRunContextSchema = z.object({
  senior: z.object({
    name: z.string().min(1).max(120),
    age: z.number(),
    livingSituation: z.string().min(1).max(500),
    caregiver: z.string().min(1).max(120),
    aacVolunteer: z.string().min(1).max(120),
  }),
  messages: z.array(
    z.object({
      id: z.string().min(1).max(120),
      sender: z.enum(["senior", "trustkaki", "system"]),
      text: z.string().max(5000),
      timestamp: z.string().max(80),
      agentId: agentIdSchema.optional(),
    })
  ),
  currentRiskLevel: riskLevelSchema,
  knownContext: z
    .object({
      items: z
        .array(
          z
            .object({
              type: z.enum([
                "preference",
                "usual_routine",
                "observed_operational_context",
              ]),
              targetStore: z.enum(memoryTargetStores).optional(),
              contextKey: z.string().min(1).max(120).optional(),
              content: z.string().min(1).max(280),
              safeUseNotes: z.string().max(280).nullable(),
              applicationTags: z.array(z.enum(memoryApplicationTags)).max(3),
            })
            .strict()
        )
        .max(12),
    })
    .strict()
    .default({ items: [] }),
});

export const orchestratorInputSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  context: agentRunContextSchema.extend({
    messages: agentRunContextSchema.shape.messages.max(50),
  }),
});

export const orchestratorOutputSchema = z
  .object({
    agentsToRun: z.array(specialistAgentIdSchema),
    priority: z.partialRecord(
      specialistAgentIdSchema,
      z.enum(["high", "medium", "low"])
    ),
    reasoning: z.string().min(1),
  })
  .strict();

export const memoryCandidateSchema = z
  .object({
    targetStore: z.enum(memoryTargetStores),
    contextKey: z.string().trim().min(1).max(120),
    contextType: z.enum(memoryContextTypes),
    content: z.string().trim().min(1).max(500),
    sourceMessageId: z.string().trim().min(1).max(120),
    evidenceExcerpt: z.string().min(1).max(500),
    confidence: z.number().min(0).max(1),
    applicationTags: z
      .array(z.enum(memoryApplicationTags))
      .min(1)
      .max(3)
      .refine((tags) => new Set(tags).size === tags.length, {
        message: "Application tags must be unique",
      }),
    retentionClass: z.enum(memoryRetentionClasses),
    intent: z.enum(["confirm", "replace"]).optional(),
  })
  .strict();

export const contextMemoryOutputSchema = z
  .object({
    candidates: z.array(memoryCandidateSchema).max(8),
  })
  .strict();

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
