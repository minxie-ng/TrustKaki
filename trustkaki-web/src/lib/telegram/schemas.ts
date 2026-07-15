import { z } from "zod";

const telegramIdSchema = z.number().int().safe();

export const telegramPrivateTextUpdateSchema = z.object({
  update_id: telegramIdSchema.nonnegative(),
  message: z.object({
    message_id: telegramIdSchema.positive(),
    date: telegramIdSchema.nonnegative(),
    from: z.object({
      id: telegramIdSchema.positive(),
      is_bot: z.literal(false),
    }),
    chat: z.object({
      id: telegramIdSchema,
      type: z.literal("private"),
    }),
    text: z.string().min(1),
  }),
});

export const telegramSendMessageResponseSchema = z.object({
  ok: z.literal(true),
  result: z.object({
    message_id: telegramIdSchema.positive(),
  }),
});
