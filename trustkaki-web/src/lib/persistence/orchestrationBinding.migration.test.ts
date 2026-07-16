import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Gate 5 orchestration replay binding migration", () => {
  const migrationsDir = join(process.cwd(), "supabase", "migrations");
  const migrationName = readdirSync(migrationsDir).find((name) =>
    name.endsWith("_gate_5_orchestration_replay_binding.sql")
  );

  it("keeps replay fingerprints private and exposes only a service-role binding RPC", () => {
    expect(migrationName).toBeDefined();
    const sql = readFileSync(join(migrationsDir, migrationName!), "utf8");

    expect(sql).toContain("trustkaki_private.orchestration_persistence_hmac_keys");
    expect(sql).toContain("extensions.gen_random_bytes(32)");
    expect(sql).toContain("trustkaki_private.orchestration_persistence_bindings");
    expect(sql).toContain("client_message_id text not null unique");
    expect(sql).toContain("payload_hmac text not null");
    expect(sql).not.toMatch(/payload_(?:hash|json)\s+text/i);
    expect(sql).toContain("create or replace function public.bind_orchestration_persistence");
    expect(sql).toContain("security definer");
    expect(sql).toContain("set search_path = ''");
    expect(sql).toContain("errcode = 'PT409'");
    expect(sql).toContain("on conflict do nothing");
    expect(sql).toMatch(/revoke all on function public\.bind_orchestration_persistence[\s\S]+from public, anon, authenticated, service_role/i);
    expect(sql).toMatch(/grant execute on function public\.bind_orchestration_persistence[\s\S]+to service_role/i);
    expect(sql).not.toMatch(/to anon|to authenticated/i);
  });
});
