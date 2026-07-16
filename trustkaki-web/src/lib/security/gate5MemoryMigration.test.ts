import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20260716060000_gate_5_memory_operationalisation.sql"
  ),
  "utf8"
).toLowerCase();

function functionDefinition(name: string) {
  const match = sql.match(
    new RegExp(
      `create or replace function (?:public|trustkaki_private)\\.${name}\\([\\s\\S]*?\\n\\$\\$;`
    )
  );
  if (!match) throw new Error(`Function ${name} is missing`);
  return match[0];
}

describe("Gate 5 memory operationalisation migration", () => {
  it("extends every context store with shared lifecycle and provenance fields", () => {
    for (const table of [
      "routine_baselines",
      "senior_health_contexts",
      "senior_memories",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table}[\\s\\S]*?context_key text[\\s\\S]*?` +
            `extraction_method text[\\s\\S]*?source_message_id uuid[\\s\\S]*?` +
            `confidence numeric\\(3,2\\)[\\s\\S]*?last_confirmed_at timestamptz[\\s\\S]*?` +
            `expires_at timestamptz[\\s\\S]*?superseded_by_id uuid[\\s\\S]*?` +
            `application_tags text\\[\\][\\s\\S]*?created_by_caregiver_id uuid[\\s\\S]*?` +
            `created_by_system text[\\s\\S]*?updated_by_caregiver_id uuid[\\s\\S]*?` +
            `updated_by_system text`
        )
      );
    }
  });

  it("backfills caregiver-confirmed rows before requiring keys and methods", () => {
    for (const table of [
      "routine_baselines",
      "senior_health_contexts",
      "senior_memories",
    ]) {
      const update = sql.indexOf(`update public.${table}`);
      const required = sql.indexOf(
        `alter table public.${table}\n  alter column context_key set not null`
      );
      expect(update).toBeGreaterThan(-1);
      expect(required).toBeGreaterThan(update);
    }
    expect(sql).toContain("extraction_method = 'caregiver_confirmed'");
    expect(sql).toContain("last_confirmed_at = coalesce(last_confirmed_at, created_at)");
  });

  it("keeps existing seed inserts valid with stable row-id-derived keys", () => {
    expect(sql).toContain("create or replace function trustkaki_private.prepare_senior_context_insert");
    expect(sql).toContain("new.id::text");
    for (const table of [
      "routine_baselines",
      "senior_health_contexts",
      "senior_memories",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `create trigger ${table}_prepare_context[\\s\\S]*?before insert on public\\.${table}`
        )
      );
    }
  });

  it("enforces one unexpired-or-expired active row per senior and key in each store", () => {
    for (const table of [
      "routine_baselines",
      "senior_health_contexts",
      "senior_memories",
    ]) {
      expect(sql).toMatch(
        new RegExp(
          `create unique index [^;]+on public\\.${table}\\s*\\(senior_id, context_key\\)\\s*` +
            `where status = 'active'`
        )
      );
    }
    expect(sql).toContain("expires_at is null or expires_at > now()");
  });

  it("creates an append-only auditable event stream without browser writes", () => {
    expect(sql).toMatch(
      /create table public\.senior_context_events[\s\S]*event_type text not null[\s\S]*before_snapshot jsonb[\s\S]*after_snapshot jsonb[\s\S]*command_id uuid not null unique/
    );
    for (const event of [
      "proposal_accepted",
      "proposal_rejected",
      "confirmed",
      "corrected",
      "superseded",
      "archived",
      "expired",
    ]) {
      expect(sql).toContain(`'${event}'`);
    }
    expect(sql).toContain("alter table public.senior_context_events enable row level security");
    expect(sql).toContain("revoke all on table public.senior_context_events");
    expect(sql).toContain("create trigger senior_context_events_append_only");
    expect(sql).toContain("senior context events are append-only");
    expect(sql).not.toMatch(
      /grant\s+(insert|update|delete)[^;]*senior_context_events[^;]*authenticated/i
    );
  });

  it("uses a private keyed HMAC binding and never readable unsalted fingerprints", () => {
    expect(sql).toContain("create table trustkaki_private.context_command_hmac_keys");
    expect(sql).toContain("extensions.gen_random_bytes(32)");
    expect(sql).toContain("create table trustkaki_private.context_command_bindings");
    expect(sql).toContain("payload_hmac text not null");
    expect(sql).toContain("extensions.hmac(");
    expect(sql).toContain("'sha256'");
    expect(sql).not.toContain("payload_fingerprint");
    expect(sql).not.toContain("md5(");
  });

  it("locks every privileged function search path and binds canonical command payloads", () => {
    for (const name of [
      "context_command_hmac",
      "bind_context_command",
      "require_context_admin",
      "apply_automatic_senior_context",
      "correct_senior_context",
      "archive_senior_context",
    ]) {
      const definition = functionDefinition(name);
      expect(definition).toContain("security definer");
      expect(definition).toContain("set search_path = ''");
    }

    const binding = functionDefinition("bind_context_command");
    expect(binding).toContain("actor_id");
    expect(binding).toContain("payload_hmac");
    expect(binding).toContain("command id was already used for a different action");
    expect(binding).toContain("on conflict (command_id) do nothing");
  });

  it("keeps automatic activation service-only and returns prior replay results", () => {
    const definition = functionDefinition("apply_automatic_senior_context");
    expect(definition).toContain("auth.jwt() ->> 'role'");
    expect(definition).toContain("<> 'service_role'");
    expect(definition).toContain("v_confidence is null");
    expect(definition).toContain("trustkaki_private.bind_context_command");
    expect(definition).toContain("'duplicate', true");
    expect(sql).toMatch(
      /revoke all on function public\.apply_automatic_senior_context[\s\S]*?from public, anon, authenticated;[\s\S]*?grant execute on function public\.apply_automatic_senior_context[\s\S]*?to service_role;/
    );
  });

  it("requires trusted admin metadata and senior access for correction and archive", () => {
    const authorization = functionDefinition("require_context_admin");
    expect(authorization).toContain("auth.jwt() -> 'app_metadata'");
    expect(authorization).toContain("demo_admin");
    expect(authorization).toContain("trustkaki_private.can_access_senior(p_senior_id)");

    for (const name of ["correct_senior_context", "archive_senior_context"]) {
      const definition = functionDefinition(name);
      expect(definition).toContain("trustkaki_private.require_context_admin(p_senior_id)");
      expect(definition).toContain("trustkaki_private.bind_context_command");
      expect(sql).toMatch(
        new RegExp(
          `grant execute on function public\\.${name}[\\s\\S]*?to authenticated;`
        )
      );
    }
  });

  it("checks stale versions and bounded reasons before state or event writes", () => {
    for (const name of ["correct_senior_context", "archive_senior_context"]) {
      const definition = functionDefinition(name);
      const conflict = definition.indexOf("using errcode = 'pt409'");
      const stateWrite = definition.search(/\n\s*(update|insert into) public\./);
      const eventWrite = definition.indexOf("insert into public.senior_context_events");
      expect(definition).toContain("p_reason is null");
      expect(definition).toContain("char_length(trim(p_reason)) between 8 and 500");
      expect(conflict).toBeGreaterThan(-1);
      expect(stateWrite).toBeGreaterThan(conflict);
      expect(eventWrite).toBeGreaterThan(conflict);
    }
  });

  it("supersedes correction targets transactionally and emits immutable history", () => {
    const definition = functionDefinition("correct_senior_context");
    expect(definition).toContain("for update");
    expect(definition).toContain("status = 'superseded'");
    expect(definition).toContain("superseded_by_id");
    expect(definition).toContain("'corrected'");
    expect(definition).toContain("'superseded'");
    expect(definition).toContain("insert into public.senior_context_events");
  });
});
