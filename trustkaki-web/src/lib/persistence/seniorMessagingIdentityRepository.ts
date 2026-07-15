import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type { SeniorMessagingPlatform } from "@/lib/supabase/types";

type ServiceClient = SupabaseClient;

function getClient(): ServiceClient {
  const client = createTrustKakiServiceClient();
  if (!client) throw new Error("Messaging identity storage is unavailable");
  return client;
}

export async function findSeniorIdByMessagingIdentity(args: {
  platform: SeniorMessagingPlatform;
  externalUserId: string;
  externalChatId?: string | null;
}): Promise<string | null> {
  const externalUserId = args.externalUserId.trim();
  const externalChatId = args.externalChatId?.trim() || null;
  if (!externalUserId || (args.externalChatId !== undefined && !externalChatId)) {
    return null;
  }

  let query = getClient()
    .from("senior_messaging_identities")
    .select("senior_id")
    .eq("platform", args.platform)
    .eq("external_user_id", externalUserId);

  if (externalChatId) query = query.eq("external_chat_id", externalChatId);

  const { data, error } = await query
    .eq("is_active", true)
    .not("verified_at", "is", null)
    .maybeSingle();

  if (error) throw new Error("Messaging identity lookup failed");
  return (data as { senior_id: string } | null)?.senior_id ?? null;
}
