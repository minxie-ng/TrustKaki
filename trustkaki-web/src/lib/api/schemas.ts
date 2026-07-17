import { z } from "zod";
import {
  memoryApplicationTags,
  type MemoryApplicationTag,
} from "@/lib/memory/contracts";

const seniorIdSchema = z.string().uuid();
const commandIdSchema = z.string().uuid();
const expectedUpdatedAtSchema = z.string().datetime({ offset: true });
const hhmmSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const timezoneSchema = z.string().trim().min(1).max(80).refine((value) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return true;
  } catch {
    return false;
  }
});

export const contextStoreSchema = z.enum([
  "memory",
  "health_context",
  "routine_baseline",
]);

const contextKeySchema = z
  .string()
  .trim()
  .min(2)
  .max(120)
  .regex(/^[a-z0-9_:-]+$/);
const applicationTagsSchema = z
  .array(z.enum(memoryApplicationTags))
  .max(memoryApplicationTags.length)
  .refine((tags) => new Set(tags).size === tags.length, {
    message: "Application tags must be unique.",
  });
const expiresAtSchema = z.string().datetime({ offset: true }).nullable();
const safeUseNotesSchema = z.string().trim().max(500).nullable();
export const contextScheduleSchema = z.record(z.string(), z.json());
const contextCommandBase = {
  commandId: commandIdSchema,
  contextId: z.string().uuid(),
  expectedUpdatedAt: expectedUpdatedAtSchema,
  reason: z.string().trim().min(10).max(500),
};

export const seniorContextActionRequestSchema = z.union([
  z
    .object({
      ...contextCommandBase,
      action: z.literal("archive"),
      store: contextStoreSchema,
    })
    .strict(),
  z
    .object({
      ...contextCommandBase,
      action: z.literal("correct"),
      store: z.literal("memory"),
      replacement: z
        .object({
          contextKey: contextKeySchema,
          memoryType: z.enum([
            "communication_preference",
            "family_context",
            "food_preference",
            "routine_preference",
            "aac_preference",
            "other",
          ]),
          content: z.string().trim().min(1).max(500),
          importance: z.number().int().min(1).max(5),
          safeUseNotes: safeUseNotesSchema,
          applicationTags: applicationTagsSchema,
          expiresAt: expiresAtSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...contextCommandBase,
      action: z.literal("correct"),
      store: z.literal("health_context"),
      replacement: z
        .object({
          contextKey: contextKeySchema,
          contextType: z.enum([
            "mobility",
            "appetite",
            "medication",
            "sensory",
            "cognitive",
            "social",
            "other",
          ]),
          description: z.string().trim().min(1).max(500),
          safeUseNotes: z.string().trim().min(1).max(500),
          applicationTags: applicationTagsSchema,
          expiresAt: expiresAtSchema,
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      ...contextCommandBase,
      action: z.literal("correct"),
      store: z.literal("routine_baseline"),
      replacement: z
        .object({
          contextKey: contextKeySchema,
          baselineType: z.enum([
            "response_cadence",
            "meal",
            "mobility",
            "aac_participation",
            "social_comfort",
            "medication",
            "other",
          ]),
          label: z.string().trim().min(1).max(120),
          usualPattern: z.string().trim().min(1).max(500),
          scheduleJson: contextScheduleSchema,
          safeUseNotes: safeUseNotesSchema,
          applicationTags: applicationTagsSchema,
          expiresAt: expiresAtSchema,
        })
        .strict(),
    })
    .strict(),
]);

export type SeniorContextActionCommand = z.infer<
  typeof seniorContextActionRequestSchema
>;

interface SeniorContextReadItemBase {
  id: string;
  contextKey: string;
  safeUseNotes: string | null;
  applicationTags: MemoryApplicationTag[];
  source: string;
  lastConfirmedAt: string;
  expiresAt: string | null;
  updatedAt: string;
}

export type SeniorContextReadItem =
  | (SeniorContextReadItemBase & {
      store: "memory";
      memoryType:
        | "communication_preference"
        | "family_context"
        | "food_preference"
        | "routine_preference"
        | "aac_preference"
        | "other";
      content: string;
      importance: number;
    })
  | (SeniorContextReadItemBase & {
      store: "health_context";
      contextType:
        | "mobility"
        | "appetite"
        | "medication"
        | "sensory"
        | "cognitive"
        | "social"
        | "other";
      description: string;
    })
  | (SeniorContextReadItemBase & {
      store: "routine_baseline";
      baselineType:
        | "response_cadence"
        | "meal"
        | "mobility"
        | "aac_participation"
        | "social_comfort"
        | "medication"
        | "other";
      label: string;
      usualPattern: string;
      scheduleJson: z.infer<typeof contextScheduleSchema>;
    });

export interface SeniorContextReadModel {
  seniorId: string;
  items: SeniorContextReadItem[];
}

export const contactKindSchema = z.enum([
  "family_guardian", "aac_staff", "healthcare_contact",
]);
export const contactChannelSchema = z.enum(["whatsapp", "sms", "voice", "email"]);
export const notificationCategorySchema = z.enum([
  "wellbeing_follow_up", "health_safety", "digital_safety", "urgent_safety",
]);
export const escalationDestinationSchema = z.enum([
  "family_guardian", "aac_supervisor", "healthcare_follow_up", "emergency_guidance",
]);

export const agentMessageRequestSchema = z.object({
  seniorId: seniorIdSchema,
  message: z.string().trim().min(1).max(5000),
  clientMessageId: z.string().trim().min(1).max(120).optional(),
}).strict();

export const specialistAgentRequestSchema = agentMessageRequestSchema;

export const manualBriefingRequestSchema = z.object({
  seniorId: seniorIdSchema,
  trigger: z.literal("manual_override"),
}).strict();

export const queueActionRequestSchema = z.object({
  queueItemId: z.string().trim().min(1).max(120),
  commandId: z.string().uuid(),
  expectedUpdatedAt: z.string().datetime({ offset: true }),
  actionType: z.enum([
    "mark_for_follow_up",
    "assign",
    "record_outcome",
    "snooze",
    "escalate",
    "resolve",
  ]),
  outcomeType: z
    .enum([
      "reached_and_okay",
      "needs_follow_up",
      "referred_to_aac_staff",
      "unable_to_reach",
      "resolved",
    ])
    .optional(),
  note: z.string().max(500).optional(),
  assignedCaregiverId: z.string().trim().min(1).max(120).optional(),
  snoozedUntil: z.string().trim().min(1).max(80).optional(),
  escalationDestination: z.enum([
    "family_guardian",
    "aac_supervisor",
    "healthcare_follow_up",
    "emergency_guidance",
  ]).optional(),
  notificationCategory: notificationCategorySchema.optional(),
}).superRefine((value, ctx) => {
  const actionNeedsOutcome = value.actionType === "record_outcome" || value.actionType === "resolve";
  const actionNeedsNote =
    value.actionType === "record_outcome" ||
    value.actionType === "snooze" ||
    value.actionType === "escalate" ||
    value.actionType === "resolve";

  if (value.actionType === "escalate" && !value.escalationDestination) {
    ctx.addIssue({
      code: "custom",
      message: "Escalation destination is required.",
      path: ["escalationDestination"],
    });
  }
  if (value.actionType === "escalate" && !value.notificationCategory) {
    ctx.addIssue({
      code: "custom",
      message: "Notification category is required.",
      path: ["notificationCategory"],
    });
  }
  if (
    value.actionType === "escalate" &&
    value.escalationDestination === "emergency_guidance" &&
    value.notificationCategory !== "urgent_safety"
  ) {
    ctx.addIssue({
      code: "custom",
      message: "Emergency guidance requires urgent safety.",
      path: ["notificationCategory"],
    });
  }

  if (actionNeedsOutcome && !value.outcomeType) {
    ctx.addIssue({
      code: "custom",
      message: "Outcome type is required for this action.",
      path: ["outcomeType"],
    });
  }

  if (actionNeedsNote && (value.note?.trim().length ?? 0) < 10) {
    ctx.addIssue({
      code: "custom",
      message: "A short note is required for this action.",
      path: ["note"],
    });
  }
});

export const seniorContactCreateRequestSchema = z.object({
  commandId: commandIdSchema,
  displayName: z.string().trim().min(1).max(120),
  relationship: z.string().trim().min(1).max(80),
  contactKind: contactKindSchema,
  preferredLanguage: z.string().trim().min(2).max(20),
  timezone: timezoneSchema,
  escalationPriority: z.number().int().positive().max(1000),
}).strict();

export const seniorContactUpdateRequestSchema = seniorContactCreateRequestSchema.extend({
  expectedUpdatedAt: expectedUpdatedAtSchema,
  active: z.boolean(),
}).strict();

const methodBaseSchema = z.object({
  commandId: commandIdSchema,
  channel: contactChannelSchema,
  destination: z.string().trim().min(3).max(320),
  methodPriority: z.number().int().positive().max(1000),
  timezone: timezoneSchema,
  quietHoursStart: hhmmSchema.nullable().optional(),
  quietHoursEnd: hhmmSchema.nullable().optional(),
});

function normalizeContactDestination(channel: z.infer<typeof contactChannelSchema>, value: string) {
  if (channel === "email") return value.trim().toLowerCase();
  return value.trim().replace(/[\s().-]/g, "");
}

function validateContactDestination(
  value: { channel: z.infer<typeof contactChannelSchema>; destination?: string | null },
  ctx: z.RefinementCtx
) {
  if (value.destination == null) return;
  const normalized = normalizeContactDestination(value.channel, value.destination);
  const valid = value.channel === "email"
    ? z.string().email().safeParse(normalized).success
    : /^\+[1-9]\d{7,14}$/.test(normalized);
  if (!valid) {
    ctx.addIssue({
      code: "custom",
      path: ["destination"],
      message: "Destination is invalid for the selected channel.",
    });
  }
}

function requireQuietHoursPair(
  value: { quietHoursStart?: string | null; quietHoursEnd?: string | null },
  ctx: z.RefinementCtx
) {
  if (Boolean(value.quietHoursStart) !== Boolean(value.quietHoursEnd)) {
    ctx.addIssue({ code: "custom", message: "Quiet hours require start and end." });
  }
  if (value.quietHoursStart && value.quietHoursStart === value.quietHoursEnd) {
    ctx.addIssue({ code: "custom", message: "Quiet hours must have a duration." });
  }
}

export const contactMethodCreateRequestSchema = methodBaseSchema
  .strict()
  .superRefine((value, ctx) => {
    requireQuietHoursPair(value, ctx);
    validateContactDestination(value, ctx);
  })
  .transform((value) => ({
    ...value,
    destination: normalizeContactDestination(value.channel, value.destination),
  }));

export const contactMethodUpdateRequestSchema = methodBaseSchema.extend({
  destination: z.string().trim().min(3).max(320).nullable().optional(),
  expectedUpdatedAt: expectedUpdatedAtSchema,
  verificationStatus: z.enum(["pending", "verified", "rejected"]),
  verificationMethod: z.enum([
    "admin_confirmed", "provider_verified", "imported_record",
  ]).nullable(),
  verifiedAt: z.string().datetime({ offset: true }).nullable(),
  active: z.boolean(),
}).strict().superRefine((value, ctx) => {
  requireQuietHoursPair(value, ctx);
  validateContactDestination(value, ctx);
  if (
    value.verificationStatus === "verified" &&
    (!value.verificationMethod || !value.verifiedAt)
  ) {
    ctx.addIssue({ code: "custom", message: "Verified methods require evidence." });
  }
}).transform((value) => ({
  ...value,
  destination: value.destination == null
    ? value.destination
    : normalizeContactDestination(value.channel, value.destination),
}));

export const contactConsentRequestSchema = z.object({
  commandId: commandIdSchema,
  eventType: z.enum(["granted", "revoked"]),
  categories: z.array(notificationCategorySchema).max(4),
  allowUrgentQuietHours: z.boolean(),
  confirmationMethod: z.enum(["written", "verbal", "digital", "imported_record"]),
  confirmedAt: z.string().datetime({ offset: true }),
  expiresAt: z.string().datetime({ offset: true }).nullable().optional(),
  note: z.string().trim().min(10).max(500).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.eventType === "granted" && value.categories.length === 0) {
    ctx.addIssue({ code: "custom", message: "Granted consent requires a category." });
  }
  if (value.eventType === "revoked" && value.categories.length > 0) {
    ctx.addIssue({ code: "custom", message: "Revoked consent has no categories." });
  }
  if (
    value.allowUrgentQuietHours &&
    !value.categories.includes("urgent_safety")
  ) {
    ctx.addIssue({ code: "custom", message: "Urgent override requires urgent consent." });
  }
});

export const recipientPreviewRequestSchema = z.object({
  category: notificationCategorySchema,
  destination: escalationDestinationSchema,
  evaluationTime: z.string().datetime({ offset: true }),
  requestedChannel: contactChannelSchema.nullable().optional(),
}).strict();

export const proactiveCheckInScheduleRequestSchema = z.object({
  commandId: commandIdSchema,
  action: z.enum(["configure", "pause", "resume", "manual_run"]),
  platform: z.enum(["telegram", "whatsapp"]),
  localSendTime: hhmmSchema,
  timezone: timezoneSchema,
  activeWeekdays: z.array(z.number().int().min(1).max(7)).min(1).max(7)
    .refine((value) => new Set(value).size === value.length, {
      message: "Active weekdays must be unique.",
    }),
  initialResponseMinutes: z.number().int().min(1).max(1440),
  retryResponseMinutes: z.number().int().min(1).max(1440),
  initialMessageTemplate: z.string().trim().min(1).max(1000),
  retryMessageTemplate: z.string().trim().min(1).max(1000),
  reason: z.string().trim().max(500).nullable().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.action === "pause" && (value.reason?.length ?? 0) < 10) {
    ctx.addIssue({
      code: "custom",
      message: "A short reason is required when pausing check-ins.",
      path: ["reason"],
    });
  }
});

export async function parseJsonBody<T>(
  request: Request,
  schema: z.ZodType<T>
): Promise<
  | { ok: true; data: T }
  | { ok: false; status: 400 | 413; error: string }
> {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > 128_000) {
    return { ok: false, status: 413, error: "Request body too large" };
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return { ok: false, status: 400, error: "Invalid JSON body" };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return { ok: false, status: 400, error: "Invalid request body" };
  }

  return { ok: true, data: parsed.data };
}
