import { NextResponse } from "next/server";
import { getSupabasePublicConfig, getSupabaseServerConfig } from "@/lib/supabase/config";
import { createTrustKakiServiceClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REQUIRED_TABLES = [
  "seniors",
  "messages",
  "patterns",
  "caregiver_queue_items",
  "whatsapp_webhook_events",
  "telegram_webhook_events",
  "proactive_check_in_schedules",
] as const;

function hasValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function versionInfo() {
  return {
    version: process.env.npm_package_version ?? "0.1.0",
    commit:
      process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
      process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ??
      null,
  };
}

async function canReachRequiredTables(): Promise<boolean> {
  const client = createTrustKakiServiceClient();
  if (!client) return false;

  for (const table of REQUIRED_TABLES) {
    const { error } = await client
      .from(table)
      .select("id", { head: true, count: "exact" });
    if (error) return false;
  }

  return true;
}

export async function GET() {
  const supabasePublicConfigured = !!getSupabasePublicConfig();
  const supabaseServiceConfigured = !!getSupabaseServerConfig();
  const telegramConfigured =
    hasValue(process.env.TELEGRAM_BOT_TOKEN) &&
    hasValue(process.env.TELEGRAM_WEBHOOK_SECRET);
  const telegramProcessorConfigured = hasValue(
    process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET
  );
  const schedulerConfigured = hasValue(process.env.CRON_SECRET);
  const whatsappProcessorConfigured = hasValue(
    process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET
  );
  const checks = {
    app: true,
    supabasePublicConfigured,
    supabaseServiceConfigured,
    database: supabaseServiceConfigured
      ? await canReachRequiredTables()
      : false,
    llmConfigured: hasValue(process.env.TRUSTKAKI_LLM_API_KEY),
    whatsappConfigured:
      hasValue(process.env.WHATSAPP_ACCESS_TOKEN) &&
      hasValue(process.env.WHATSAPP_PHONE_NUMBER_ID) &&
      hasValue(process.env.WHATSAPP_VERIFY_TOKEN) &&
      hasValue(process.env.META_APP_SECRET) &&
      hasValue(process.env.TRUSTKAKI_DEMO_SENIOR_PHONE),
    telegramConfigured,
    telegramProcessorConfigured,
    schedulerConfigured,
    whatsappProcessorConfigured,
    internalProcessorConfigured: whatsappProcessorConfigured,
  };

  const criticalOk =
    checks.app &&
    checks.supabasePublicConfigured &&
    checks.supabaseServiceConfigured &&
    checks.database &&
    checks.llmConfigured;

  return NextResponse.json(
    {
      status: criticalOk ? "ok" : "degraded",
      checks,
      ...versionInfo(),
    },
    { status: criticalOk ? 200 : 503 }
  );
}
