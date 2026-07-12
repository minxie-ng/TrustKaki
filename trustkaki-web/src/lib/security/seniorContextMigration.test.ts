import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const sql = readFileSync(
  join(process.cwd(), "supabase/migrations/20260712020000_senior_context_baselines.sql"),
  "utf8"
);

describe("senior context and baseline migration", () => {
  it("creates persistent routine, health context, and memory tables", () => {
    expect(sql).toContain("create table if not exists public.routine_baselines");
    expect(sql).toContain("create table if not exists public.senior_health_contexts");
    expect(sql).toContain("create table if not exists public.senior_memories");
  });

  it("links all context tables to seniors", () => {
    expect(sql).toContain("references public.seniors(id) on delete cascade");
    expect(sql).toContain("routine_baselines_senior_idx");
    expect(sql).toContain("senior_health_contexts_senior_idx");
    expect(sql).toContain("senior_memories_senior_idx");
  });

  it("enables RLS and scopes reads through caregiver senior access", () => {
    expect(sql).toContain("alter table public.routine_baselines enable row level security");
    expect(sql).toContain("alter table public.senior_health_contexts enable row level security");
    expect(sql).toContain("alter table public.senior_memories enable row level security");
    expect(sql).toContain("public.trustkaki_can_access_senior(senior_id)");
    expect(sql).not.toContain("to anon");
    expect(sql).not.toContain("using (true)");
  });

  it("documents that context is operational support, not diagnosis", () => {
    expect(sql).toContain("not a diagnosis");
    expect(sql).toContain("caregiver-confirmed context");
  });
});
