import "server-only";

import { createTrustKakiUserClient } from "@/lib/supabase/server";
import type { PersistenceMeta } from "./orchestration";

export async function resetDemoPersistence(args: {
  accessToken: string;
}): Promise<PersistenceMeta> {
  const client = createTrustKakiUserClient(args.accessToken);
  if (!client) {
    return {
      mode: "local_demo",
      configured: false,
      persisted: false,
      reason: "Supabase env vars are not configured. Demo data was not reset.",
    };
  }

  const { error } = await client.rpc("reset_trustkaki_demo");
  if (error) throw new Error("reset TrustKaki demo failed");
  return { mode: "supabase", configured: true, persisted: true };
}
