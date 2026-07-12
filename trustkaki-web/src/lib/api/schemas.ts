import { z } from "zod";
import { agentRunContextSchema, triageSignalSchema } from "@/lib/agents/schemas";

const boundedContextSchema = agentRunContextSchema.extend({
  messages: agentRunContextSchema.shape.messages.max(50),
});

export const agentMessageRequestSchema = z.object({
  message: z.string().trim().min(1).max(5000),
  context: boundedContextSchema,
});

export const specialistAgentRequestSchema = agentMessageRequestSchema.extend({
  triageSignals: z.array(triageSignalSchema).max(20).optional(),
});

export const manualBriefingRequestSchema = z.object({
  context: boundedContextSchema,
  triageResult: z.unknown().optional(),
  aacNudgeResult: z.unknown().optional(),
  digitalSafetyResult: z.unknown().optional(),
  trigger: z.literal("manual_override"),
});

export const queueActionRequestSchema = z.object({
  queueItemId: z.string().trim().min(1).max(120),
  actionType: z.enum([
    "mark_for_follow_up",
    "assign",
    "record_outcome",
    "snooze",
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
