import { afterEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const rpc = vi.fn();
vi.mock("./persistenceSupport", () => ({getClient: () => ({rpc})}));
afterEach(() => vi.unstubAllEnvs());
it("encrypts retry content and binds it to the request identity", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "synthetic-server-key");
  const { sealReceipt, openReceipt } = await import("./webRequestReceipt");
  const encrypted = sealReceipt({text:"PRIVATE_CONTEXT"}, "request-a");
  expect(encrypted).not.toContain("PRIVATE_CONTEXT");
  expect(openReceipt(encrypted,"request-a")).toEqual({text:"PRIVATE_CONTEXT"});
  expect(() => openReceipt(encrypted,"request-b")).toThrow();
  expect(() => openReceipt(encrypted.slice(0,-5)+"xxxxx","request-a")).toThrow();
});
it("fails closed without a server encryption key", async () => {
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "");
  const { sealReceipt } = await import("./webRequestReceipt");
  expect(() => sealReceipt({},"request-a")).toThrow();
});

it("rejects replay responses with no recoverable result", async () => {
  rpc.mockResolvedValue({data:{status:"replay"},error:null});
  const {webRequestReceipt} = await import("./webRequestReceipt");
  await expect(webRequestReceipt({clientMessageId:"id",seniorId:"senior",userId:"user",message:"hello",token:"worker"},"claim")).rejects.toThrow();
});
