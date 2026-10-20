import { beforeEach, afterEach, expect, it, vi } from "vitest";
// @ts-expect-error jsdom intentionally ships without declarations.
import { JSDOM } from "jsdom";
import { clearPendingWebRequests, readPendingWebRequest, rememberPendingWebRequest } from "./pendingWebRequest";
let dom: JSDOM;
const message = { id: "request-1", sender: "senior" as const, text: "Fictional private wording", timestamp: "2026-10-20T00:00:00.000Z" };
beforeEach(() => { dom = new JSDOM("", { url: "https://trustkaki.example" }); vi.stubGlobal("window", dom.window); clearPendingWebRequests(); });
afterEach(() => { clearPendingWebRequests(); dom.window.close(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });
it("clears a pending write that finishes hashing after sign-out", async () => {
  let finish!: (value: ArrayBuffer) => void;
  vi.spyOn(crypto.subtle, "digest").mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
  const work = rememberPendingWebRequest("owner", "senior", message);
  clearPendingWebRequests();
  finish(new ArrayBuffer(32));
  await work;
  expect(readPendingWebRequest("owner", "senior")).toBeNull();
});
it("expires recovery at 24 hours and clears stored metadata", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-20T00:00:00Z"));
  await rememberPendingWebRequest("owner", "senior", message);
  vi.advanceTimersByTime(24 * 60 * 60 * 1000);
  expect(readPendingWebRequest("owner", "senior")).toBeNull();
  expect(dom.window.sessionStorage.length).toBe(0);
});
it("keeps in-memory navigation recovery when storage writes are unavailable", async () => {
  vi.spyOn(dom.window.Storage.prototype, "setItem").mockImplementation(() => { throw new Error("quota"); });
  await rememberPendingWebRequest("owner", "senior", message);
  expect(readPendingWebRequest("owner", "senior")?.message).toEqual(message);
});
it("rejects malformed metadata and clears only this app's pending keys", async () => {
  dom.window.sessionStorage.setItem('trustkaki:pending-web:v1:["owner","senior"]', '{"id":3}');
  expect(readPendingWebRequest("owner", "senior")).toBeNull();
  dom.window.sessionStorage.setItem("unrelated", "retain");
  await rememberPendingWebRequest("owner", "senior", message);
  clearPendingWebRequests();
  expect(dom.window.sessionStorage.length).toBe(1);
  expect(dom.window.sessionStorage.getItem("unrelated")).toBe("retain");
});
it("falls back to memory if storage reads become unavailable", async () => {
  await rememberPendingWebRequest("owner", "senior", message);
  vi.spyOn(dom.window.Storage.prototype, "getItem").mockImplementation(() => { throw new Error("blocked"); });
  expect(readPendingWebRequest("owner", "senior")?.message).toEqual(message);
});
