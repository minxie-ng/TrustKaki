import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";

export type VoiceDraftStatus = "processing" | "pending" | "confirmed" | "discarded" | "expired";
export interface VoiceDraftActor { seniorId: string; senderUserId: string; chatId: string }
function client(): SupabaseClient {
  const value = createTrustKakiServiceClient();
  if (!value) throw new Error("Voice draft storage is unavailable");
  return value;
}
function check(error: { message: string } | null): void {
  // Provider/database messages may contain transcript text: keep failures private.
  if (error) throw new Error("Voice draft storage operation failed");
}
export async function prepareVoiceDraft(args: VoiceDraftActor & { eventId: string }): Promise<{ id: string } | null> {
  const { data, error } = await client().rpc("prepare_telegram_voice_draft", {
    p_event_id: args.eventId, p_senior_id: args.seniorId,
    p_sender_user_id: args.senderUserId, p_chat_id: args.chatId,
  });
  check(error);
  return data?.[0] ? { id: data[0].id as string } : null;
}
export async function getVoiceDraft(eventId: string): Promise<{ id: string; status: VoiceDraftStatus; transcript: string | null } | null> {
  await expireVoiceDrafts();
  const { data, error } = await client().from("telegram_voice_drafts")
    .select("id,status,transcript").eq("event_id", eventId).maybeSingle();
  check(error);
  return data as { id: string; status: VoiceDraftStatus; transcript: string | null } | null;
}
export async function stageVoiceDraft(args: { draftId: string; transcript: string }): Promise<boolean> {
  const { data, error } = await client().rpc("stage_telegram_voice_draft", {
    p_draft_id: args.draftId, p_transcript: args.transcript,
  });
  check(error);
  return data === true;
}
export async function confirmVoiceDraft(args: VoiceDraftActor & { draftId: string; action: "confirm" | "discard" }): Promise<string | null> {
  const { data, error } = await client().rpc("finish_telegram_voice_draft", {
    p_draft_id: args.draftId, p_senior_id: args.seniorId,
    p_sender_user_id: args.senderUserId, p_chat_id: args.chatId, p_action: args.action,
  });
  check(error);
  return data as string | null;
}
export async function expireVoiceDrafts(): Promise<void> {
  const { error } = await client().rpc("expire_telegram_voice_drafts");
  check(error);
}

export async function reserveVoiceInference(draftId: string): Promise<boolean> {
  const { data, error } = await client().rpc("reserve_telegram_voice_inference", { p_draft_id: draftId });
  check(error);
  return data === true;
}
