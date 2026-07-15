import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const directory = join(process.cwd(), "supabase/migrations");
  const file = readdirSync(directory).find((name) =>
    name.endsWith("_telegram_demo_continuity.sql")
  );
  if (!file) throw new Error("Telegram demo continuity migration is missing");
  return readFileSync(join(directory, file), "utf8").toLowerCase();
}

describe("Telegram demo continuity migration", () => {
  it("defines provider-neutral verified senior identities", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table public.senior_messaging_identities");
    expect(sql).toContain("id uuid primary key default gen_random_uuid()");
    expect(sql).toContain("senior_id uuid not null references public.seniors(id)");
    expect(sql).toContain("platform text not null check (platform in ('whatsapp', 'telegram'))");
    expect(sql).toContain("external_user_id text not null");
    expect(sql).toContain("external_chat_id text");
    expect(sql).toContain("verified_at timestamptz");
    expect(sql).toContain("is_active boolean not null default true");
    expect(sql).toContain("unique (platform, external_user_id)");
    expect(sql).toContain("senior_messaging_identities_active_senior_platform_idx");
  });

  it("defines a durable idempotent Telegram inbox", () => {
    const sql = migrationSql();

    expect(sql).toContain("create table public.telegram_webhook_events");
    expect(sql).toContain("update_id text not null unique");
    expect(sql).toContain("telegram_message_id text");
    expect(sql).toContain("sender_user_id text");
    expect(sql).toContain("chat_id text");
    expect(sql).toContain("payload jsonb not null default '{}'::jsonb");
    expect(sql).toContain("orchestration_result jsonb");
    expect(sql).toContain("orchestration_context jsonb");
    expect(sql).toContain("outbound_status text not null default 'not_started'");
    expect(sql).toContain("telegram_webhook_events_status_received_idx");
  });

  it("keeps identity and transport rows inaccessible to browser roles", () => {
    const sql = migrationSql();

    expect(sql).toContain("alter table public.senior_messaging_identities enable row level security");
    expect(sql).toContain("alter table public.telegram_webhook_events enable row level security");
    expect(sql).toContain("revoke all on table public.senior_messaging_identities from anon, authenticated");
    expect(sql).toContain("revoke all on table public.telegram_webhook_events from anon, authenticated");
    expect(sql).toContain("grant select, insert, update, delete on table public.senior_messaging_identities to service_role");
    expect(sql).toContain("grant select, insert, update, delete on table public.telegram_webhook_events to service_role");
  });

  it("claims retryable events atomically through a locked-down invoker function", () => {
    const sql = migrationSql();

    expect(sql).toContain("create or replace function public.claim_telegram_webhook_event");
    expect(sql).toContain("security invoker");
    expect(sql).toContain("set search_path = public, pg_temp");
    expect(sql).toContain("status in ('received', 'failed')");
    expect(sql).toContain("revoke all on function public.claim_telegram_webhook_event(uuid) from public, anon, authenticated");
    expect(sql).toContain("grant execute on function public.claim_telegram_webhook_event(uuid) to service_role");
  });
});
