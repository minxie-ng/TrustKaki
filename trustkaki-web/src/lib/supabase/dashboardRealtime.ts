"use client";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrustKakiBrowserClient } from "./browser";
import type { Database } from "./types";

export interface DashboardRealtimeSubscription {
  unsubscribe: () => void;
}

export function subscribeToDashboardChanges(args: {
  onChange: () => void;
  debounceMs?: number;
  client?: SupabaseClient<Database> | null;
}): DashboardRealtimeSubscription | null {
  const client = args.client ?? createTrustKakiBrowserClient();
  if (!client) return null;

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleRefresh = () => {
    if (refreshTimer) clearTimeout(refreshTimer);
    refreshTimer = setTimeout(args.onChange, args.debounceMs ?? 250);
  };

  const channel = client
    .channel(`caregiver-case-sync-${crypto.randomUUID()}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "caregiver_queue_items" },
      scheduleRefresh
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "caregiver_actions" },
      scheduleRefresh
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "senior_contacts" },
      scheduleRefresh
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "contact_methods" },
      scheduleRefresh
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "contact_consent_events" },
      scheduleRefresh
    )
    .subscribe();

  return {
    unsubscribe: () => {
      if (refreshTimer) clearTimeout(refreshTimer);
      void client.removeChannel(channel);
    },
  };
}
