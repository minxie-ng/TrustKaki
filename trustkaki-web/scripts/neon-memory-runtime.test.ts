import { mkdtemp, readFile, stat, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "vitest";
import { runtimeConnectionUrls, replaceRuntimeDatabaseUrl } from "./neon-memory-runtime-support";
const direct = "postgresql://owner:owner-secret@ep-fictional.neon.tech/neondb?sslmode=require";
const pooled = "postgresql://owner:owner-secret@ep-fictional-pooler.neon.tech/neondb?sslmode=require";
it("uses a separate login, preserves owner URL and requires matching secure endpoints", () => {
  const urls = runtimeConnectionUrls(direct, pooled, "private-runtime-password");
  expect(new URL(urls.pooled).username).toBe("trustkaki_memory_app");
  expect(new URL(urls.direct).searchParams.get("sslmode")).toBe("verify-full");
  expect(() => runtimeConnectionUrls(direct, pooled.replace("ep-fictional-pooler", "ep-foreign-pooler"), "password")).toThrow();
  expect(() => runtimeConnectionUrls(direct.replace("sslmode=require", "sslmode=disable"), pooled, "password")).toThrow();
});
it("atomically updates only DATABASE_URL and preserves file permissions and other values", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trustkaki-env-"));
  const path = join(dir, ".env.local");
  const original = `# local\nDATABASE_URL='${pooled}'\nDATABASE_URL_UNPOOLED='${direct}'\nOTHER_SECRET='do-not-change'\n`;
  try {
    await writeFile(path, original, { mode: 0o600 });
    const updated = runtimeConnectionUrls(direct, pooled, "private-runtime-password").pooled;
    await replaceRuntimeDatabaseUrl(path, original, updated);
    const saved = await readFile(path, "utf8");
    expect(saved).toContain(`DATABASE_URL_UNPOOLED='${direct}'`);
    expect(saved).toContain("OTHER_SECRET='do-not-change'");
    expect(saved).toContain(`DATABASE_URL='${updated}'`);
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    await expect(replaceRuntimeDatabaseUrl(path, original, updated)).rejects.toThrow("Environment changed");
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it("refuses duplicate or absent DATABASE_URL entries instead of silently overwriting", async () => {
  const dir = await mkdtemp(join(tmpdir(), "trustkaki-env-"));
  const path = join(dir, ".env.local");
  try {
    for (const original of ["OTHER=keep\n", `DATABASE_URL='${pooled}'\nDATABASE_URL='${pooled}'\n`]) {
      await writeFile(path, original);
      await expect(replaceRuntimeDatabaseUrl(path, original, pooled)).rejects.toThrow("Exactly one DATABASE_URL");
      expect(await readFile(path, "utf8")).toBe(original);
    }
  } finally { await rm(dir, { recursive: true, force: true }); }
});
it.each(["host=ep-foreign.neon.tech", "port=9999", "user=owner", "password=owner-secret", "options=-crole%3Downer", "sslmode=disable"])("rejects PostgreSQL query overrides: %s", override => {
  expect(() => runtimeConnectionUrls(`${direct}&${override}`, pooled, "runtime-secret")).toThrow();
  expect(() => runtimeConnectionUrls(direct, `${pooled}&${override}`, "runtime-secret")).toThrow();
});
