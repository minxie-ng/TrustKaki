import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const TRUSTKAKI_PROJECT_REF = "mbzolhqtcbdfosifjkmd";

export function validateLiveProjectIdentity(args: {
  linkedProjectRef: string;
  configuredUrls: string[];
}): void {
  if (args.linkedProjectRef.trim() !== TRUSTKAKI_PROJECT_REF) {
    throw new Error("Live project guard rejected linked project ref");
  }
  if (args.configuredUrls.length === 0) {
    throw new Error("Live project guard requires a configured Supabase URL");
  }
  for (const configuredUrl of args.configuredUrls) {
    let hostname: string;
    try {
      hostname = new URL(configuredUrl).hostname.toLowerCase();
    } catch {
      throw new Error("Live project guard rejected configured Supabase URL");
    }
    if (hostname !== `${TRUSTKAKI_PROJECT_REF}.supabase.co`) {
      throw new Error("Live project guard rejected configured project host");
    }
  }
}

export async function assertTrustKakiLiveProjectIdentity(
  supabaseRoot: string
): Promise<void> {
  const linkedProjectRef = await readFile(
    resolve(supabaseRoot, "supabase/.temp/project-ref"),
    "utf8"
  );
  const configuredUrls = [
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_URL,
  ].filter((value): value is string => Boolean(value));

  validateLiveProjectIdentity({ linkedProjectRef, configuredUrls });
}
