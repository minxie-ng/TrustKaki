import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

describe("durable web request claims", () => {
  let db: PGlite;
  const user = "00000000-0000-4000-8000-000000000011";
  const senior = "00000000-0000-4000-8000-000000000001";
  const token = "00000000-0000-4000-8000-000000000021";
  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create schema auth; create schema trustkaki_private;
      create table public.messages(client_message_id text);
      create table trustkaki_private.orchestration_persistence_bindings(client_message_id text);
      create function auth.jwt() returns jsonb language sql as $$ select '{"role":"service_role"}'::jsonb $$;
      create function trustkaki_private.orchestration_persistence_hmac(jsonb) returns text language sql as $$ select md5($1::text) $$;`);
    const dir = resolve("supabase/migrations");
    await db.exec(readFileSync(resolve(dir, readdirSync(dir).find(n => n.endsWith("_web_request_idempotency.sql"))!), "utf8"));
  });
  beforeEach(async () => { await db.exec("truncate trustkaki_private.web_orchestration_requests, public.messages, trustkaki_private.orchestration_persistence_bindings"); });
  afterAll(async () => { await db?.close(); });
  async function call(id: string, action = "claim", payload: string | null = null, overrides: { user?: string; senior?: string; message?: string; token?: string } = {}) {
    return (await db.query<{ result: { status: string; payload?: string } }>(
      "select public.web_orchestration_request($1,$2,$3::uuid,$4::uuid,$5,$6::uuid,$7) result",
      [action,id,overrides.user ?? user,overrides.senior ?? senior,overrides.message ?? "Hello",overrides.token ?? token,payload],
    )).rows[0].result;
  }
  it("grants one claim and rejects simultaneous duplicate work", async () => {
    const results = await Promise.all([call("concurrent"),call("concurrent")]);
    expect(results.map(r => r.status).sort()).toEqual(["busy","run"]);
  });
  it("replays completion without another processing claim", async () => {
    expect((await call("done")).status).toBe("run");
    await call("done","snapshot","encrypted snapshot");
    await call("done","complete","encrypted reply");
    expect(await call("done")).toEqual({status:"replay",payload:"encrypted reply"});
  });
  it("resumes only the frozen persistence payload after a failure", async () => {
    await call("partial");
    await call("partial","snapshot","frozen result");
    await call("partial","release");
    expect(await call("partial")).toEqual({status:"resume",payload:"frozen result"});
    expect((await call("partial")).status).toBe("busy");
  });
  it("rejects reused IDs with changed text, user or senior", async () => {
    await call("conflict");
    for (const overrides of [{message:"Changed"},{user:token},{senior:token}]) {
      expect((await call("conflict","claim",null,overrides)).status).toBe("conflict");
    }
  });
  it("allows identical text with distinct IDs", async () => {
    expect((await call("separate-a")).status).toBe("run");
    await call("separate-a","snapshot","snapshot");
    await call("separate-a","complete","response");
    expect((await call("separate-b")).status).toBe("run");
  });
  it("does not steal an uncertain request after expiry", async () => {
    await call("expired");
    await db.exec("update trustkaki_private.web_orchestration_requests set expires_at = now() - interval '1 second' where client_message_id='expired'");
    expect((await call("expired")).status).toBe("expired");
  });
  it("rejects a stale worker token", async () => {
    await call("fenced");
    await expect(call("fenced","snapshot","wrong",{token:senior})).rejects.toThrow();
    expect((await call("fenced")).status).toBe("busy");
  });
  it("keeps receipts and RPC inaccessible to browser roles", async () => {
    for (const role of ["anon","authenticated"]) {
      const result = await db.query<{allowed:boolean}>("select has_function_privilege($1, 'public.web_orchestration_request(text,text,uuid,uuid,text,uuid,text)', 'EXECUTE') allowed",[role]);
      expect(result.rows[0].allowed).toBe(false);
    }
  });
  it("does not rerun IDs already persisted before receipt rollout", async () => {
    await db.exec("insert into public.messages values ('legacy-message'); insert into trustkaki_private.orchestration_persistence_bindings values ('legacy-binding')");
    expect((await call("legacy-message")).status).toBe("expired");
    expect((await call("legacy-binding")).status).toBe("expired");
  });

  it("holds newer work until a partial older save is complete", async () => {
    await call("old-green");
    await call("old-green","snapshot","green result");
    await call("old-green","release");
    expect((await call("new-red")).status).toBe("busy");
    expect((await call("old-green")).status).toBe("resume");
    await call("old-green","complete","saved green reply");
    expect((await call("new-red")).status).toBe("run");
    await call("new-red","snapshot","red result");
    await call("new-red","complete","saved red reply");
    expect((await call("old-green")).status).toBe("replay");
  });

  it("allows new work after the old replay window closes and clears expired ciphertext", async () => {
    await call("old-expired");
    await call("old-expired","snapshot","expired encrypted context");
    await db.exec("update trustkaki_private.web_orchestration_requests set expires_at=now()-interval '1 second' where client_message_id='old-expired'");
    expect((await call("new-after-expiry")).status).toBe("run");
    expect((await call("old-expired")).status).toBe("expired");
    const rows = await db.query<{snapshot:string|null}>("select snapshot from trustkaki_private.web_orchestration_requests where client_message_id='old-expired'");
    expect(rows.rows[0].snapshot).toBeNull();
  });

});
