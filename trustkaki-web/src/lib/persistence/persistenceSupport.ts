import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { PersistenceMeta } from "./orchestration";

export type TrustKakiClient = SupabaseClient;
export type TableRow<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Row"];
export type TableInsert<T extends keyof Database["public"]["Tables"]> =
  Database["public"]["Tables"][T]["Insert"];

export function localDemoMeta(reason?: string): PersistenceMeta {
  return {
    mode: "local_demo",
    configured: false,
    persisted: false,
    reason:
      reason ??
      "Supabase env vars are not configured. Running in non-persistent local demo mode.",
  };
}

export function supabaseMeta(persisted = true): PersistenceMeta {
  return { mode: "supabase", configured: true, persisted };
}

export function getClient(): TrustKakiClient | null {
  return createTrustKakiServiceClient() as TrustKakiClient | null;
}

export function throwIfError(
  error: { message: string } | null,
  operation: string
): void {
  if (error) throw new Error(`${operation}: ${error.message}`);
}

export function isMissingRelationError(
  error: { code?: string; message?: string } | null
): boolean {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    /relation .* does not exist|schema cache/i.test(error.message ?? "")
  );
}
