import { z } from "zod";

const seniorIdSchema = z.string().uuid();

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
