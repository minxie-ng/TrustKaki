import "server-only";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseServerConfig } from "./config";
import type { Database } from "./types";

let serviceClient: SupabaseClient<Database> | null = null;

export function createTrustKakiServiceClient(): SupabaseClient<Database> | null {
  const config = getSupabaseServerConfig();
  if (!config) return null;

  serviceClient ??= createClient<Database>(config.url, config.serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return serviceClient;
}
