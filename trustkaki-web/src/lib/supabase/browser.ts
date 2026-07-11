"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabasePublicConfig } from "./config";
import type { Database } from "./types";

let browserClient: SupabaseClient<Database> | null = null;

export function createTrustKakiBrowserClient(): SupabaseClient<Database> | null {
  const config = getSupabasePublicConfig();
  if (!config) return null;

  browserClient ??= createBrowserClient<Database>(config.url, config.anonKey);
  return browserClient;
}
