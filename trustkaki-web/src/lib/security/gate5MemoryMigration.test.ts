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
const types = readFileSync(join(process.cwd(), "src/lib/supabase/types.ts"), "utf8");

const approvedApplicationTags = [
  "concise_text",
  "gentle_one_to_one",
  "voice_preferred",
  "practical_meal_prompt",
  "accessibility_support",
  "trusted_contact_route",
] as const;

const approvedRejectionCategories = [
  "low_confidence",
  "unsupported_evidence",
  "sensitive_data",
  "diagnostic_inference",
  "treatment_instruction",
  "invalid_candidate",
] as const;

function quotedValues(source: string) {
  return [...source.matchAll(/["']([^"']+)["']/g)].map((match) => match[1]);
}

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

  it("uses exactly the Task 1 application-tag vocabulary in SQL and database types", () => {
    const contextTagTypes = types.match(
      /export type ContextApplicationTag =[\s\S]*?;/
    )?.[0];
    expect(contextTagTypes).toBeDefined();

    expect(quotedValues(contextTagTypes ?? "")).toEqual(approvedApplicationTags);

    const sqlAllowlists = [
      ...sql.matchAll(
        /(?:application_tags|v_tags) <@ array\[([\s\S]*?)\]::text\[\]/g
      ),
    ];
    expect(sqlAllowlists).toHaveLength(5);
    for (const allowlist of sqlAllowlists) {
      expect(quotedValues(allowlist[1])).toEqual(approvedApplicationTags);
    }
  });

  it("creates an append-only auditable event stream without browser writes", () => {
    expect(sql).toMatch(
      /create table public\.senior_context_events[\s\S]*context_key text[\s\S]*event_type text not null[\s\S]*before_snapshot jsonb[\s\S]*after_snapshot jsonb[\s\S]*command_id uuid not null[\s\S]*unique nulls not distinct \(command_id, event_type, context_id\)/
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

  it("guards automatic replacements with the locked active row version in every store", () => {
    const definition = functionDefinition("apply_automatic_senior_context");
    expect(definition).toMatch(
      /perform 1[\s\S]*?from public\.seniors[\s\S]*?where id = p_senior_id[\s\S]*?for update;/
    );
    expect(definition).toContain("p_payload_json ->> 'expected_updated_at'");
    expect(definition).toContain("v_intent = 'replace'");
    expect(definition).toContain("v_expected_updated_at is null");
    expect(definition).toContain("v_existing_updated_at is distinct from v_expected_updated_at");
    expect(definition).toContain("using errcode = 'pt409'");
    expect(definition).toContain("v_existing_content is distinct from v_candidate_content");

    for (const table of [
      "senior_memories",
      "senior_health_contexts",
      "routine_baselines",
    ]) {
      expect(definition).toMatch(
        new RegExp(
          `from public\\.${table}[\\s\\S]{0,180}status = 'active'[\\s\\S]{0,80}for update`
        )
      );
    }

    const lockedRows = definition.lastIndexOf("for update;");
    const replacementConflict = definition.indexOf(
      "v_existing_updated_at is distinct from v_expected_updated_at"
    );
    const firstLifecycleMutation = definition.indexOf("set status = 'superseded'");
    expect(replacementConflict).toBeGreaterThan(lockedRows);
    expect(firstLifecycleMutation).toBeGreaterThan(replacementConflict);
  });

  it("rejects missing confirm and replace targets before lifecycle mutation", () => {
    const definition = functionDefinition("apply_automatic_senior_context");
    const lockedRows = definition.lastIndexOf("for update;");
    const missingTargetGuard = definition.indexOf(
      "v_existing_id is null and v_intent in ('confirm', 'replace')"
    );
    const staleGuard = definition.indexOf("v_expected_updated_at is null");
    const firstLifecycleMutation = definition.indexOf("set status = 'superseded'");

    expect(missingTargetGuard).toBeGreaterThan(lockedRows);
    expect(definition.slice(missingTargetGuard)).toContain(
      "lifecycle intent requires an active context target"
    );
    expect(definition.slice(missingTargetGuard)).toContain("using errcode = 'pt409'");
    expect(staleGuard).toBeGreaterThan(missingTargetGuard);
    expect(firstLifecycleMutation).toBeGreaterThan(missingTargetGuard);
  });

  it("leaves create intent able to insert when no active target exists", () => {
    const definition = functionDefinition("apply_automatic_senior_context");
    expect(definition).toContain(
      "v_intent text := lower(trim(coalesce(p_payload_json ->> 'intent', 'create')))"
    );
    expect(definition).toContain("v_intent in ('confirm', 'replace')");
    expect(definition).not.toContain("v_intent in ('create', 'confirm', 'replace')");
    expect(definition.indexOf("insert into public.senior_memories")).toBeGreaterThan(
      definition.indexOf("v_existing_id is null and v_intent in ('confirm', 'replace')")
    );
  });

  it("serializes admin mutations on the same senior boundary as automatic replacement", () => {
    for (const name of ["correct_senior_context", "archive_senior_context"]) {
      expect(functionDefinition(name)).toMatch(
        /perform 1[\s\S]*?from public\.seniors[\s\S]*?where id = p_senior_id[\s\S]*?for update;/
      );
    }
  });

  it("records valid rejection outcomes without requiring an exact evidence match", () => {
    const definition = functionDefinition("apply_automatic_senior_context");
    for (const category of approvedRejectionCategories) {
      expect(sql).toContain(`'${category}'`);
      expect(types).toContain(`"${category}"`);
    }
    expect(sql).not.toContain("'unsupported_category'");
    expect(types).not.toContain('"unsupported_category"');

    const messageLookup = definition.indexOf("from public.messages");
    const rejectionBranch = definition.indexOf("if v_decision = 'rejected' then");
    const exactExcerptCheck = definition.indexOf("position(v_excerpt in v_message_text) = 0");
    const confidenceParse = definition.indexOf("v_confidence :=");
    const replacementVersionParse = definition.indexOf("v_expected_updated_at :=");
    expect(messageLookup).toBeGreaterThan(-1);
    expect(rejectionBranch).toBeGreaterThan(messageLookup);
    expect(exactExcerptCheck).toBeGreaterThan(rejectionBranch);
    expect(confidenceParse).toBeGreaterThan(rejectionBranch);
    expect(replacementVersionParse).toBeGreaterThan(rejectionBranch);
    expect(definition).toContain("senior_id = p_senior_id and sender = 'senior'");
  });

  it("never exposes rejected candidate text or keys in caregiver-readable events", () => {
    expect(sql).toContain("event_type = 'proposal_rejected' and context_id is null");
    expect(sql).toContain("context_key is null");
    expect(sql).toContain("before_snapshot is null and after_snapshot is null");

    const definition = functionDefinition("apply_automatic_senior_context");
    const rejectionInsert = definition.match(
      /if v_decision = 'rejected' then[\s\S]*?insert into public\.senior_context_events \([\s\S]*?return v_result;[\s\S]*?end if;/
    );
    expect(rejectionInsert).not.toBeNull();
    expect(rejectionInsert?.[0]).not.toContain("evidence_excerpt");
    expect(rejectionInsert?.[0]).not.toContain("context_key,");
    expect(rejectionInsert?.[0]).not.toContain("after_snapshot");
    expect(rejectionInsert?.[0]).not.toContain("v_excerpt");
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

  it("rejects null correction and archive stores before command binding", () => {
    for (const name of ["correct_senior_context", "archive_senior_context"]) {
      const definition = functionDefinition(name);
      const nullStoreGuard = definition.indexOf("p_store is null");
      const commandBinding = definition.indexOf(
        "trustkaki_private.bind_context_command"
      );

      expect(nullStoreGuard).toBeGreaterThan(-1);
      expect(definition.slice(nullStoreGuard, commandBinding)).toContain(
        "using errcode = '22023'"
      );
      expect(commandBinding).toBeGreaterThan(nullStoreGuard);
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

  it("emits explicit superseded and primary events for replacements and corrections", () => {
    const automatic = functionDefinition("apply_automatic_senior_context");
    const correction = functionDefinition("correct_senior_context");

    expect(automatic).toMatch(
      /insert into public\.senior_context_events[\s\S]*?'superseded'[\s\S]*?insert into public\.senior_context_events[\s\S]*?'proposal_accepted'/
    );
    expect(correction).toMatch(
      /insert into public\.senior_context_events[\s\S]*?'superseded'[\s\S]*?insert into public\.senior_context_events[\s\S]*?'corrected'/
    );
    expect(automatic).toContain("if v_duplicate then");
    expect(automatic.indexOf("if v_duplicate then")).toBeLessThan(
      automatic.indexOf("insert into public.senior_context_events")
    );
    expect(correction.indexOf("if v_duplicate then")).toBeLessThan(
      correction.indexOf("insert into public.senior_context_events")
    );
  });

  it("records the returned final superseded row in replacement audit events", () => {
    const definition = functionDefinition("apply_automatic_senior_context");
    expect(definition).toContain("v_superseded_after jsonb");

    for (const table of [
      "senior_memories",
      "senior_health_contexts",
      "routine_baselines",
    ]) {
      expect(definition).toMatch(
        new RegExp(
          `update public\\.${table} set superseded_by_id = v_new_id[\\s\\S]{0,100}` +
            `returning to_jsonb\\(${table}\\) into v_superseded_after`
        )
      );
    }
    expect(definition).toMatch(
      /'superseded',[\s\S]{0,180}v_before,\s*v_superseded_after/
    );
    expect(definition).not.toContain(
      "v_before || jsonb_build_object('status', 'superseded'"
    );
  });

  it("uses the returned final superseded row throughout correction history", () => {
    const definition = functionDefinition("correct_senior_context");
    expect(definition).toContain("v_superseded_after jsonb");

    for (const table of [
      "senior_memories",
      "senior_health_contexts",
      "routine_baselines",
    ]) {
      expect(definition).toMatch(
        new RegExp(
          `update public\\.${table} set superseded_by_id = v_new_id[\\s\\S]{0,100}` +
            `returning to_jsonb\\(${table}\\) into v_superseded_after`
        )
      );
    }
    expect(definition).toMatch(
      /'superseded', trim\(p_reason\), v_before,\s*v_superseded_after/
    );
    expect(definition).toMatch(
      /'corrected', trim\(p_reason\),\s*v_superseded_after, v_after/
    );
    expect(definition).not.toContain(
      "v_before || jsonb_build_object('status', 'superseded'"
    );
  });
});
