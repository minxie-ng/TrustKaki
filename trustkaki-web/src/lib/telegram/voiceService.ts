import "server-only";

import { z } from "zod";
import type { PersistedTelegramEvent } from "@/lib/persistence/telegramEventRepository";
import { markTelegramEventProcessed, updateTelegramOutboundState } from "@/lib/persistence/telegramEventRepository";
import { findSeniorIdByMessagingIdentity } from "@/lib/persistence/seniorMessagingIdentityRepository";
import { prepareVoiceDraft, getVoiceDraft, stageVoiceDraft, confirmVoiceDraft, reserveVoiceInference } from "@/lib/persistence/telegramVoiceRepository";
import { downloadTelegramVoice, transcribeVoice } from "./voiceAudio";
import type { TelegramOutboundClient, SendTelegramTextParams } from "./types";

const mediaSchema = z.object({ fileId:z.string().min(1).max(1024), duration:z.number().nonnegative().finite(), fileSize:z.number().nonnegative().finite().optional() });
const callbackSchema = z.object({ draftId:z.string().uuid(), action:z.enum(["confirm","discard"]), callbackId:z.string().min(1).max(256) });
const RETRY_TEXT = "I couldn't turn that voice note into text. Please type your message or send another short voice note. This is not an emergency channel.";
export function isTelegramVoiceEnabled(): boolean {
  return process.env.TRUSTKAKI_TELEGRAM_VOICE_ENABLED === "true" && Boolean(process.env.GROQ_API_KEY) && Boolean(process.env.TELEGRAM_BOT_TOKEN);
}

// Control replies are not care observations. Reuse the inbox outbound receipt on retries.
async function reply(event: PersistedTelegramEvent, client: TelegramOutboundClient, params: Omit<SendTelegramTextParams,"chatId">):Promise<void> {
  if(event.outbound_status === "accepted") return;
  const sent = await client.sendText({chatId:event.chat_id!,...params});
  await updateTelegramOutboundState({eventId:event.id,outboundStatus:"accepted",outboundMessageId:sent.messageId});
}

export async function processVoiceEvent(event:PersistedTelegramEvent, client:TelegramOutboundClient, processText:(eventId:string)=>Promise<unknown>):Promise<void> {
  if(!isTelegramVoiceEnabled() || !event.sender_user_id || !event.chat_id) {await markTelegramEventProcessed(event.id);return;}
  const seniorId = await findSeniorIdByMessagingIdentity({platform:"telegram",externalUserId:event.sender_user_id,externalChatId:event.chat_id});
  if(!seniorId) {await markTelegramEventProcessed(event.id);return;}
  if(event.event_type === "voice_callback") {
    const parsed=callbackSchema.safeParse(event.payload);
    if(!parsed.success) {await markTelegramEventProcessed(event.id);return;}
    const {draftId,action,callbackId}=parsed.data;
    // Acknowledgement is best effort; callback ownership is enforced again by the SQL transaction.
    await client.answerCallback?.(callbackId).catch(()=>undefined);
    const textEventId=await confirmVoiceDraft({draftId,seniorId,senderUserId:event.sender_user_id,chatId:event.chat_id,action});
    if(textEventId) {
      await processText(textEventId);
    } else {
      await reply(event,client,{text:action === "discard" ? "Please type your message or send a new voice note. Nothing was added to the care conversation by this button." : "That voice draft is no longer available. Please type your message or send a new voice note."});
    }
    await markTelegramEventProcessed(event.id);return;
  }
  const media=mediaSchema.safeParse(event.payload);
  if(!media.success || media.data.duration <= 0 || media.data.duration > 60 || (media.data.fileSize ?? 0) > 2_000_000) {
    await reply(event,client,{text:"Please send a voice note up to 60 seconds and 2 MB, or type your message."});
    await markTelegramEventProcessed(event.id);return;
  }
  const draft=await prepareVoiceDraft({eventId:event.id,seniorId,senderUserId:event.sender_user_id,chatId:event.chat_id});
  if(!draft) {
    await reply(event,client,{text:"Voice input is temporarily unavailable or this note has expired. Please type your message."});
    await markTelegramEventProcessed(event.id);return;
  }
  const existing=await getVoiceDraft(event.id);
  if(!existing || !["processing","pending"].includes(existing.status)) {await markTelegramEventProcessed(event.id);return;}
  let transcript=existing.transcript;
  if(!transcript) {
    if(!await reserveVoiceInference(draft.id)) {
      await reply(event,client,{text:"That voice note could not be completed safely. Please type your message or send a new voice note."});
      await markTelegramEventProcessed(event.id);return;
    }
    try {
      const audio=await downloadTelegramVoice({botToken:process.env.TELEGRAM_BOT_TOKEN!,fileId:media.data.fileId});
      transcript=await transcribeVoice(audio,process.env.GROQ_API_KEY!);
    } catch {
      await confirmVoiceDraft({draftId:draft.id,seniorId,senderUserId:event.sender_user_id,chatId:event.chat_id,action:"discard"});
      await reply(event,client,{text:RETRY_TEXT});await markTelegramEventProcessed(event.id);return;
    }
    if(!await stageVoiceDraft({draftId:draft.id,transcript})) {await markTelegramEventProcessed(event.id);return;}
  }
  await reply(event,client,{
    text:`I heard:\n“${transcript}”\n\nIs this correct? Confirm to add it to our care conversation, or try again. This draft expires in 10 minutes. This is not an emergency channel.`,
    replyMarkup:{inline_keyboard:[[{text:"Confirm",callback_data:`voice:confirm:${draft.id}`},{text:"Try again",callback_data:`voice:discard:${draft.id}`}]]},
  });
  await markTelegramEventProcessed(event.id);
}
