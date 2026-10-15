import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("server-only", () => ({}));
const { worker } = vi.hoisted(() => ({ worker: vi.fn() }));
vi.mock("@/lib/memory/indexWorker", () => ({ processPendingMemory: worker }));
import { GET, POST } from "./route";
const request = (token?: string) => new NextRequest("https://example.test/api/internal/memory/process-pending?limit=9999", {
  headers: token ? { authorization: `Bearer ${token}` } : {},
});
beforeEach(() => { vi.unstubAllEnvs(); worker.mockReset(); });
it("fails closed without a configured secret or Neon backend", async () => {
  vi.stubEnv("CRON_SECRET", ""); vi.stubEnv("TRUSTKAKI_PERSONAL_MEMORY_BACKEND", "neon");
  expect((await GET(request())).status).toBe(404);
  vi.stubEnv("CRON_SECRET", "private"); vi.stubEnv("TRUSTKAKI_PERSONAL_MEMORY_BACKEND", "supabase");
  expect((await GET(request("private"))).status).toBe(404);
  expect(worker).not.toHaveBeenCalled();
});
it.each([undefined,"wrong"])("denies an unauthorized request without work (%s)", async token => {
  vi.stubEnv("CRON_SECRET", "private"); vi.stubEnv("TRUSTKAKI_PERSONAL_MEMORY_BACKEND", "neon");
  expect((await GET(request(token))).status).toBe(401);
  expect(worker).not.toHaveBeenCalled();
});
it("uses a fixed batch bound and returns only aggregate counts", async () => {
  vi.stubEnv("CRON_SECRET", "private"); vi.stubEnv("TRUSTKAKI_PERSONAL_MEMORY_BACKEND", "neon");
  worker.mockResolvedValue({ attempted: 2, published: 1, stale: 1 });
  const response = await GET(request("private"));
  expect(response.status).toBe(200);
  expect(worker).toHaveBeenCalledWith(expect.any(AbortSignal));
  expect(await response.json()).toEqual({ status: "processed", limit: 10, attempted: 2, published: 1, stale: 1 });
  expect(response.headers.get("cache-control")).toBe("no-store");
});
it("supports protected POST and sanitizes failures", async () => {
  vi.stubEnv("CRON_SECRET", "private"); vi.stubEnv("TRUSTKAKI_PERSONAL_MEMORY_BACKEND", "neon");
  worker.mockRejectedValue(new Error("secret and personal memory"));
  const response = await POST(request("private"));
  expect(response.status).toBe(500);
  expect(await response.json()).toEqual({ status: "error" });
});
