import { z } from "zod";

const hhmmSchema = z
  .string()
  .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "Expected a 24-hour HH:mm time");

export const proactiveCheckInStageSchema = z.enum([
  "initial_send",
  "initial_deadline",
  "retry_send",
  "final_deadline",
]);

export const proactiveCheckInWorkflowStatusSchema = z.enum([
  "pending_initial_send",
  "awaiting_initial_response",
  "pending_retry_send",
  "awaiting_retry_response",
  "responded",
  "escalated",
  "cancelled",
  "failed",
]);

export const nextProactiveActionInputSchema = z.object({
  stage: proactiveCheckInStageSchema,
  scheduledFor: z.string().datetime({ offset: true }),
  now: z.string().datetime({ offset: true }),
  paused: z.boolean(),
  withinQuietHours: z.boolean(),
});

export const quietHoursInputSchema = z
  .object({
    now: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(100),
    start: hhmmSchema.nullable(),
    end: hhmmSchema.nullable(),
  })
  .superRefine((value, context) => {
    if (Boolean(value.start) !== Boolean(value.end)) {
      context.addIssue({
        code: "custom",
        message: "Quiet-hour start and end must be provided together",
      });
    }
    if (value.start && value.start === value.end) {
      context.addIssue({
        code: "custom",
        message: "Quiet-hour start and end must differ",
      });
    }
  });

export const responseDispositionInputSchema = z.object({
  workflowStatus: proactiveCheckInWorkflowStatusSchema,
  responseWindowOpenedAt: z.string().datetime({ offset: true }).nullable(),
  respondedAt: z.string().datetime({ offset: true }),
});

export type ProactiveCheckInStage = z.infer<
  typeof proactiveCheckInStageSchema
>;
export type ProactiveCheckInWorkflowStatus = z.infer<
  typeof proactiveCheckInWorkflowStatusSchema
>;
export type NextProactiveActionInput = z.infer<
  typeof nextProactiveActionInputSchema
>;
export type QuietHoursInput = z.infer<typeof quietHoursInputSchema>;
export type ResponseDispositionInput = z.infer<
  typeof responseDispositionInputSchema
>;

export type NextProactiveAction =
  | { type: "wait"; reason: "not_due" | "paused" | "quiet_hours" }
  | { type: "send_initial" }
  | { type: "send_retry" }
  | { type: "create_case" };

export type ResponseDisposition =
  | { type: "cancel_pending" }
  | { type: "annotate_late_response" }
  | {
      type: "ignore";
      reason:
        | "response_window_not_open"
        | "before_response_window"
        | "terminal_workflow";
    };
