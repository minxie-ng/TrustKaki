import { z } from 'zod';

const id = z.number().int().safe();
const human = z.object({ id: id.positive(), is_bot: z.literal(false) });
const chat = z.object({ id: id.positive(), type: z.literal('private') });
const voiceUpdate = z.object({
  update_id: id.nonnegative(),
  message: z.object({
    message_id: id.positive(), date: id.nonnegative().max(8640000000000),
    from: human, chat,
    text: z.never().optional(), caption: z.never().optional(),
    voice: z.object({ file_id: z.string().min(1).max(1024), duration: id.positive(), file_size: id.nonnegative().optional() }),
  }),
});
const callbackUpdate = z.object({
  update_id: id.nonnegative(),
  callback_query: z.object({
    id: z.string().min(1).max(256), from: human,
    message: z.object({ message_id: id.positive(), chat }),
    data: z.string().max(64).regex(/^voice:(confirm|discard):[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i),
  }),
});

export function parseVoiceUpdate(payload: unknown) {
  const parsed = voiceUpdate.safeParse(payload);
  if (!parsed.success) return null;
  const { update_id, message: m } = parsed.data;
  return { updateId: String(update_id), messageId: String(m.message_id), senderUserId: String(m.from.id), chatId: String(m.chat.id), timestamp: new Date(m.date * 1000).toISOString(), fileId: m.voice.file_id, duration: m.voice.duration, fileSize: m.voice.file_size };
}

export function parseVoiceCallback(payload: unknown) {
  const parsed = callbackUpdate.safeParse(payload);
  if (!parsed.success) return null;
  const { update_id, callback_query: c } = parsed.data;
  const [, action, draftId] = c.data.split(':');
  return { updateId: String(update_id), messageId: String(c.message.message_id), senderUserId: String(c.from.id), chatId: String(c.message.chat.id), callbackId: c.id, draftId, action: action as 'confirm' | 'discard' };
}
