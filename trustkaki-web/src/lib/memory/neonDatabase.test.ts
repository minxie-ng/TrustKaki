import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const release = vi.fn();
const query = vi.fn();
const connect = vi.fn(async () => ({ query, release }));
const poolConstructor = vi.fn();
vi.mock("pg", () => ({ Pool: class { constructor(config: unknown) { poolConstructor(config); } connect = connect; on() {} } }));
vi.mock("@vercel/functions", () => ({ attachDatabasePool: vi.fn() }));
const scope = { organisationId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", seniorId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.clearAllMocks(); });
it("uses transaction-local scope and non-owner role and releases the pooled client", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://runtime:private@ep-demo-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require");
  query.mockResolvedValue({ rows: [{ id: "fact" }] });
  const { neonMemorySql } = await import("./neonDatabase");
  expect(await neonMemorySql(scope, "SELECT id FROM personal_memory.records", [])).toEqual([{ id: "fact" }]);
  expect(query.mock.calls.map(call => call[0])).toEqual([
    "BEGIN", "SET LOCAL ROLE trustkaki_memory_runtime",
    expect.stringContaining("set_config"), "SELECT id FROM personal_memory.records", "COMMIT",
  ]);
  expect(release).toHaveBeenCalledTimes(1);
  expect(poolConstructor.mock.calls[0][0].connectionString).toContain("sslmode=verify-full");
});
it("rolls back failed operations and exposes only a sanitised error", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://runtime:private@ep-demo-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require");
  query.mockResolvedValue({ rows: [] }).mockRejectedValueOnce(new Error("private database error"));
  const { neonMemorySql } = await import("./neonDatabase");
  await expect(neonMemorySql(scope, "SELECT 1", [])).rejects.toThrow("Personal memory unavailable");
  expect(release).toHaveBeenCalled();
});
it("does not create a pool when unconfigured", async () => {
  vi.stubEnv("DATABASE_URL", "");
  const { personalMemoryDatabaseHealth } = await import("./neonDatabase");
  expect(await personalMemoryDatabaseHealth()).toEqual({ configured: false, reachable: null });
  expect(poolConstructor).not.toHaveBeenCalled();
});
it("rejects malformed scope and aborted work before connecting", async () => {
  const { neonMemorySql } = await import("./neonDatabase");
  await expect(neonMemorySql({ ...scope, seniorId: "bad" }, "SELECT 1", [])).rejects.toThrow();
  const controller = new AbortController(); controller.abort();
  await expect(neonMemorySql(scope, "SELECT 1", [], controller.signal)).rejects.toThrow();
  expect(connect).not.toHaveBeenCalled();
});
it("runs dependent queries in one scoped transaction and rolls back a failed callback", async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://runtime:private@ep-demo-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require");
  query.mockResolvedValue({ rows: [{ n: 1 }] });
  const { withNeonMemoryTransaction } = await import("./neonDatabase");
  await expect(withNeonMemoryTransaction(scope, async execute => {
    await execute("SELECT 1", []);
    await execute("SELECT 2", []);
    throw new Error("private failure");
  })).rejects.toThrow("Personal memory unavailable");
  expect(query.mock.calls.map(call => call[0])).toEqual([
    "BEGIN", "SET LOCAL ROLE trustkaki_memory_runtime", expect.stringContaining("set_config"), "SELECT 1", "SELECT 2", "ROLLBACK",
  ]);
  expect(release).toHaveBeenCalledTimes(1);
});
it.each(["host=attacker.example", "options=-crole=neon_superuser", "sslmode=require", "user=neondb_owner"])("rejects connection overrides: %s", async override => {
  vi.stubEnv("DATABASE_URL", `postgresql://runtime:private@ep-demo-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require&${override}`);
  const { neonMemorySql } = await import("./neonDatabase");
  await expect(neonMemorySql(scope, "SELECT 1", [])).rejects.toThrow("Personal memory unavailable");
  expect(connect).not.toHaveBeenCalled();
});
