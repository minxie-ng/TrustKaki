import { act, createElement } from "react";
import type { Root } from "react-dom/client";
// @ts-expect-error jsdom intentionally ships without declarations.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import ChatSimulation from "./ChatSimulation";
let root: Root;
let container: HTMLDivElement;
let dom: JSDOM;
beforeEach(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://trustkaki.example" });
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  container = document.createElement("div"); document.body.append(container);
  const { createRoot } = await import("react-dom/client"); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); });
it("does not send examples automatically or display scripted replies after failure", async () => {
  const fetcher = vi.fn().mockResolvedValue(new Response("failed", { status: 500 }));
  vi.stubGlobal("fetch", fetcher);
  const onComplete = vi.fn(); const onResult = vi.fn();
  await act(async () => root.render(createElement(ChatSimulation, { seniorId: "senior-1", authToken: "fictional-token", messages: [{ id: "seed", sender: "senior", text: "I prefer quiet chats", timestamp: "2026-10-17T00:00:00Z" }, { id: "fake", sender: "trustkaki", text: "Scripted reply must never appear", timestamp: "2026-10-17T00:00:00Z" }], onComplete, onResult })));
  await act(async () => (Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Use a check-in example")!).click());
  expect(fetcher).not.toHaveBeenCalled();
  await act(async () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain("server-side save may have occurred");
  expect(container.textContent).not.toContain("Scripted reply must never appear");
  expect(onComplete).not.toHaveBeenCalled(); expect(onResult).not.toHaveBeenCalled();
});

it("shows the saved reply and forwards a post-save warning without prompting a resend", async () => {
  const run = { messages: [{ text: "Could you tell me your preferences again?", agentId: "triage" }],
    traces: [], riskLevel: "red", persistence: { persisted: true, patternWatch: { status: "failed" } } };
  const fetcher = vi.fn().mockResolvedValue(Response.json(run));
  vi.stubGlobal("fetch", fetcher);
  const onComplete = vi.fn(); const onResult = vi.fn();
  await act(async () => root.render(createElement(ChatSimulation, { seniorId: "senior-2", authToken: "fictional-token",
    messages: [], onComplete, onResult })));
  await act(async () => (Array.from(container.querySelectorAll("button")).find(button => button.textContent === "Use a check-in example")!).click());
  await act(async () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain(run.messages[0].text);
  expect(container.textContent).not.toContain("server-side save may have occurred");
  expect(onResult).toHaveBeenCalledWith(run);
  expect(onComplete).toHaveBeenCalledTimes(1);
  expect(container.querySelector("textarea")!.value).toBe("");
});

it("reuses the request ID after a network failure without duplicating the inbound bubble", async () => {
  const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("connection lost"))
    .mockResolvedValue(Response.json({messages:[{text:"Hello back",agentId:"triage"}],traces:[],riskLevel:"yellow",persistence:{persisted:true}}));
  vi.stubGlobal("fetch",fetcher);
  await act(async () => root.render(createElement(ChatSimulation,{seniorId:"senior-1",authToken:"token",messages:[],onComplete:vi.fn()})));
  await act(async () => Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Use a check-in example")!.click());
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));
  await act(async () => {submit();});
  await act(async () => {submit();});
  const bodies = fetcher.mock.calls.map(call=>JSON.parse(call[1].body));
  expect(bodies[1].clientMessageId).toBe(bodies[0].clientMessageId);
  expect(container.querySelectorAll("article")).toHaveLength(2);
});

it("prevents two synchronous submits before React rerenders", async () => {
  const fetcher = vi.fn(()=>new Promise<Response>(()=>{}));
  vi.stubGlobal("fetch",fetcher);
  await act(async () => root.render(createElement(ChatSimulation,{seniorId:"senior-1",authToken:"token",messages:[],onComplete:vi.fn()})));
  await act(async () => Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Use a check-in example")!.click());
  await act(async () => {
    for (let i=0;i<2;i++) container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));
  });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("preserves a pending ID across access-token refresh for the same user", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch",fetcher);
  const props = {seniorId:"senior-1",userId:"user-1",authToken:"old-token",messages:[],onComplete:vi.fn()};
  await act(async () => root.render(createElement(ChatSimulation,props)));
  await act(async () => Array.from(container.querySelectorAll("button")).find(b=>b.textContent==="Use a check-in example")!.click());
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit",{bubbles:true,cancelable:true}));
  await act(async () => {submit();});
  await act(async () => root.render(createElement(ChatSimulation,{...props,authToken:"refreshed-token"})));
  await act(async () => {submit();});
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).clientMessageId).toBe(JSON.parse(fetcher.mock.calls[0][1].body).clientMessageId);
});

it("keeps the unresolved request recoverable when an example changes the draft", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const props = { seniorId: "senior-1", userId: "user-1", authToken: "token", messages: [], onComplete: vi.fn() };
  await act(async () => root.render(createElement(ChatSimulation, props)));
  const example = () => Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Use a check-in example")!.click();
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { example(); });
  const original = container.querySelector("textarea")!.value;
  await act(async () => { submit(); });
  await act(async () => root.render(createElement(ChatSimulation, { ...props, messages: [{ id: "new", sender: "senior", text: "A different message", timestamp: "2026-10-20T00:00:00Z" }] })));
  await act(async () => { example(); });
  await act(async () => { submit(); });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(container.querySelector("textarea")!.value).toBe(original);
  await act(async () => { submit(); });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).clientMessageId).toBe(JSON.parse(fetcher.mock.calls[0][1].body).clientMessageId);
});

it("restores the same pending request after navigating away and back without auto-sending", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const props = { seniorId: "senior-1", userId: "restore-user", authToken: "token", messages: [], onComplete: vi.fn() };
  await act(async () => root.render(createElement(ChatSimulation, props)));
  await act(async () => Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Use a check-in example")!.click());
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { submit(); });
  await act(async () => root.render(null));
  await act(async () => root.render(createElement(ChatSimulation, props)));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(container.querySelector("textarea")!.value).toContain("quiet one-to-one");
  await act(async () => { submit(); });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).clientMessageId).toBe(JSON.parse(fetcher.mock.calls[0][1].body).clientMessageId);
});

it("recovers a pending ID after reload without storing message text or automatically sending", async () => {
  const { clearPendingWebRequests } = await import("@/lib/pendingWebRequest");
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const props = { seniorId: "reload-senior", userId: "reload-user", authToken: "token", messages: [], onComplete: vi.fn() };
  await act(async () => root.render(createElement(ChatSimulation, props)));
  const example = () => Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Use a check-in example")!.click();
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => { example(); });
  const wording = container.querySelector("textarea")!.value;
  await act(async () => { submit(); });
  const store = dom.window.sessionStorage;
  const entries = Array.from({ length: store.length }, (_, i) => [store.key(i)!, store.getItem(store.key(i)!)!] as const);
  expect(JSON.stringify(entries)).not.toContain(wording);
  expect(JSON.stringify(entries)).not.toContain('"token"');
  await act(async () => root.render(null));
  clearPendingWebRequests(); // Simulate a new JS realm while preserving the tab's session storage.
  for (const [key, value] of entries) store.setItem(key, value);
  await act(async () => root.render(createElement(ChatSimulation, props)));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(container.querySelector("textarea")!.value).toBe("");
  expect(container.textContent).toContain("Nothing is sent automatically");
  await act(async () => { example(); });
  await act(async () => { submit(); });
  await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).clientMessageId).toBe(JSON.parse(fetcher.mock.calls[0][1].body).clientMessageId);
});

it("does not reuse another senior or account's pending request", async () => {
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const props = { seniorId: "scope-senior-1", userId: "scope-user-1", authToken: "token", messages: [], onComplete: vi.fn() };
  await act(async () => root.render(createElement(ChatSimulation, props)));
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  const example = () => Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Use a check-in example")!.click();
  await act(async () => { example(); });
  await act(async () => { submit(); });
  await act(async () => root.render(createElement(ChatSimulation, { ...props, seniorId: "scope-senior-2" })));
  expect(container.querySelector("textarea")!.value).toBe("");
  expect(container.querySelectorAll("article")).toHaveLength(0);
  await act(async () => { example(); });
  await act(async () => { submit(); });
  await act(async () => root.render(createElement(ChatSimulation, { ...props, userId: "scope-user-2" })));
  expect(container.querySelector("textarea")!.value).toBe("");
  await act(async () => { example(); });
  await act(async () => { submit(); });
  expect(new Set(fetcher.mock.calls.map(call => JSON.parse(call[1].body).clientMessageId)).size).toBe(3);
});

it("does not renew an expired request while the component remains mounted", async () => {
  vi.useFakeTimers();
  const fetcher = vi.fn().mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const props = { seniorId: "ttl-senior", userId: "ttl-user", authToken: "token", messages: [], onComplete: vi.fn() };
  try {
    await act(async () => root.render(createElement(ChatSimulation, props)));
    await act(async () => Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Use a check-in example")!.click());
    const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    await act(async () => { submit(); });
    vi.advanceTimersByTime(24 * 60 * 60 * 1000);
    await act(async () => { submit(); });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("can no longer be replayed");
    expect(dom.window.sessionStorage.length).toBe(0);
  } finally { vi.useRealTimers(); }
});

it("ignores an expired error body from a previous senior after switching", async () => {
  let finish!: (body: unknown) => void;
  const fetcher = vi.fn().mockResolvedValueOnce({ ok: false, status: 410, json: () => new Promise(resolve => { finish = resolve; }) })
    .mockRejectedValue(new TypeError("connection lost"));
  vi.stubGlobal("fetch", fetcher);
  const props = { seniorId: "old-senior", userId: "switch-user", authToken: "token", messages: [], onComplete: vi.fn() };
  const example = () => Array.from(container.querySelectorAll("button")).find(b => b.textContent === "Use a check-in example")!.click();
  const submit = () => container.querySelector("form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
  await act(async () => root.render(createElement(ChatSimulation, props)));
  await act(async () => { example(); });
  await act(async () => { submit(); });
  expect(finish).toBeTypeOf("function");
  await act(async () => root.render(createElement(ChatSimulation, { ...props, seniorId: "new-senior" })));
  await act(async () => { example(); });
  await act(async () => { submit(); });
  await act(async () => finish({ code: "request_expired" }));
  expect(container.textContent).not.toContain("can no longer be replayed");
});
