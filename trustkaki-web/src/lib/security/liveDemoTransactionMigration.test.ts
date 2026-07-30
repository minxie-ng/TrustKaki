import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260730061854_live_demo_transaction.sql"
  ),
  "utf8"
).toLowerCase();

describe("live demo transaction migration", () => {
  it("prepares the bounded fictional case in one protected database function", () => {
    expect(migration).toContain(
      "create or replace function public.prepare_trustkaki_live_demo()"
    );
    expect(migration).toContain("perform public.reset_trustkaki_demo()");
    expect(migration).toContain("security definer");
    expect(migration).toContain("set search_path = ''");
    expect(migration).toContain("app_metadata");
    expect(migration).toContain("trustkaki_private.can_access_senior");
  });

  it("is unavailable to public and anonymous callers", () => {
    expect(migration).toContain(
      "revoke execute on function public.prepare_trustkaki_live_demo() from public"
    );
    expect(migration).toContain(
      "revoke execute on function public.prepare_trustkaki_live_demo() from anon"
    );
    expect(migration).toContain(
      "grant execute on function public.prepare_trustkaki_live_demo() to authenticated"
    );
  });
});
