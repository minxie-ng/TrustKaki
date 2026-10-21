import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import { voiceLanguageSchema, type VoiceLanguage } from "@/lib/voiceLanguage";

function client(): SupabaseClient {
  const value = createTrustKakiServiceClient();
  if (!value) throw new Error("Voice language unavailable");
  return value;
}

// Call only after verified messaging identity or scoped organisation-admin authorization.
export async function readVoiceLanguage(seniorId: string): Promise<VoiceLanguage> {
  z.uuid().parse(seniorId);
  const { data, error } = await client().from("seniors")
    .select("preferred_voice_language").eq("id", seniorId).single();
  if (error) throw new Error("Voice language unavailable");
  return z.object({ preferred_voice_language: voiceLanguageSchema }).parse(data).preferred_voice_language;
}

export async function saveVoiceLanguage(seniorId: string, language: VoiceLanguage): Promise<VoiceLanguage> {
  z.uuid().parse(seniorId);
  const value = voiceLanguageSchema.parse(language);
  const { data, error } = await client().from("seniors")
    .update({ preferred_voice_language: value }).eq("id", seniorId)
    .select("preferred_voice_language").single();
  if (error) throw new Error("Voice language unavailable");
  return z.object({ preferred_voice_language: voiceLanguageSchema }).parse(data).preferred_voice_language;
}
