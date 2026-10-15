import { randomUUID } from "node:crypto";
import { lstat, readFile, rename, unlink, writeFile } from "node:fs/promises";

export const runtimeLogin = "trustkaki_memory_app";
export function runtimeConnectionUrls(directValue: string, pooledValue: string, password: string) {
  const direct = new URL(directValue);
  const pooled = new URL(pooledValue);
  const safeOptions = (url: URL) => [...url.searchParams.keys()].every(key =>
    ["sslmode", "channel_binding"].includes(key) && url.searchParams.getAll(key).length === 1);
  if (![direct, pooled].every(url => safeOptions(url) && url.protocol === "postgresql:" && url.hostname.endsWith(".neon.tech")
    && ["require", "verify-full"].includes(url.searchParams.get("sslmode") ?? "") && !url.hash)
    || direct.hostname.includes("-pooler") || !pooled.hostname.includes("-pooler")
    || direct.hostname !== pooled.hostname.replace("-pooler", "") || direct.pathname !== pooled.pathname
    || direct.port !== pooled.port || !password) throw new Error("Matching direct and pooled Neon TLS connections required");
  for (const url of [direct, pooled]) {
    url.username = runtimeLogin; url.password = password; url.searchParams.set("sslmode", "verify-full");
  }
  return { direct: direct.href, pooled: pooled.href };
}
export async function replaceRuntimeDatabaseUrl(path: string, expected: string, url: string) {
  if (!(await lstat(path)).isFile()) throw new Error("Environment must be a regular file");
  const current = await readFile(path, "utf8");
  if (current !== expected) throw new Error("Environment changed");
  const expression = /^(?:export\s+)?DATABASE_URL\s*=.*$/gm;
  if ([...current.matchAll(expression)].length !== 1) throw new Error("Exactly one DATABASE_URL entry required");
  if (/[\r\n']/.test(url)) throw new Error("Invalid database URL");
  const temp = `${path}.${randomUUID()}.tmp`;
  try {
    await writeFile(temp, current.replace(expression, () => `DATABASE_URL='${url}'`), { mode: 0o600, flag: "wx" });
    if (await readFile(path, "utf8") !== expected) throw new Error("Environment changed");
    await rename(temp, path);
  } finally { await unlink(temp).catch(() => {}); }
}
