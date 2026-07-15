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

export async function findTelegramChatIdForSenior(
  seniorId: string
): Promise<string | null> {
  const normalizedSeniorId = seniorId.trim();
  if (!normalizedSeniorId) return null;

  const { data, error } = await getClient()
    .from("senior_messaging_identities")
    .select("external_chat_id")
    .eq("senior_id", normalizedSeniorId)
    .eq("platform", "telegram")
    .eq("is_active", true)
    .not("verified_at", "is", null)
    .not("external_chat_id", "is", null)
    .maybeSingle();

  if (error) throw new Error("Outbound messaging identity lookup failed");
  return (data as { external_chat_id: string | null } | null)?.external_chat_id ?? null;
}
