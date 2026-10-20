import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

// Execute the migration against real PostgreSQL RLS locally, never the linked project.
describe("agent diagnostics database boundary", () => {
  let db: PGlite;
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role authenticated; create role anon;
      create schema auth; create schema trustkaki_private;
      create function auth.jwt() returns jsonb language sql stable as $$
        select current_setting('request.jwt.claims', true)::jsonb
      $$;
      create function public.trustkaki_is_demo_admin() returns boolean language sql stable as $$
        select coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'demo_admin'
      $$;
      create function trustkaki_private.can_access_check_in(uuid) returns boolean language sql stable as $$
        select current_setting('test.can_access', true) = 'yes'
      $$;
      grant usage on schema auth, trustkaki_private to authenticated;
      create table public.agent_runs(id int, check_in_id uuid, input text);
      create table public.patterns(id int);
      create table public.caregiver_actions(id int);
      create table public.caregiver_queue_items(id int);
      insert into public.agent_runs values (1, '00000000-0000-4000-8000-000000000001', 'private diagnostics');
      insert into public.patterns values (1);
      insert into public.caregiver_actions values (1);
      insert into public.caregiver_queue_items values (1);
      alter table public.agent_runs enable row level security;
      alter table public.patterns enable row level security;
      alter table public.caregiver_actions enable row level security;
      alter table public.caregiver_queue_items enable row level security;
      grant select on public.agent_runs to authenticated;
      grant select on public.patterns, public.caregiver_actions, public.caregiver_queue_items to anon;
      create policy "authenticated caregivers read agent runs" on public.agent_runs for select to authenticated
        using (trustkaki_private.can_access_check_in(check_in_id));
      create policy "demo anon read patterns" on public.patterns for select to anon using (true);
      create policy "demo anon read caregiver actions" on public.caregiver_actions for select to anon using (true);
      create policy "demo anon read caregiver queue" on public.caregiver_queue_items for select to anon using (true);
    `);
    const directory = resolve(process.cwd(), "supabase/migrations");
    const file = readdirSync(directory).find(name => name.endsWith("_restrict_agent_diagnostics.sql"));
    if (!file) throw new Error("Diagnostics migration missing");
    await db.exec(readFileSync(resolve(directory, file), "utf8"));
  });
  afterAll(async () => { await db?.close(); });

  async function readAs(claims: object, access: boolean) {
    await db.query("select set_config('request.jwt.claims', $1, false), set_config('test.can_access', $2, false)", [JSON.stringify(claims), access ? "yes" : "no"]);
    await db.exec("set role authenticated");
    try { return (await db.query("select id from public.agent_runs")).rows; }
    finally { await db.exec("reset role"); }
  }

  it("denies direct trace reads by ordinary caregivers", async () => {
    expect(await readAs({ app_metadata: { role: "caregiver" } }, true)).toEqual([]);
  });
  it("does not trust a user-editable admin claim", async () => {
    expect(await readAs({ user_metadata: { role: "demo_admin" } }, true)).toEqual([]);
  });
  it("allows demo diagnostics only for an accessible senior", async () => {
    expect(await readAs({ app_metadata: { role: "demo_admin" } }, true)).toEqual([{ id: 1 }]);
    expect(await readAs({ app_metadata: { role: "demo_admin" } }, false)).toEqual([]);
  });
  it("removes dormant anonymous demo policies", async () => {
    await db.exec("set role anon");
    try {
      expect((await db.query("select id from public.patterns")).rows).toEqual([]);
      expect((await db.query("select id from public.caregiver_actions")).rows).toEqual([]);
      expect((await db.query("select id from public.caregiver_queue_items")).rows).toEqual([]);
    } finally { await db.exec("reset role"); }
  });
});
