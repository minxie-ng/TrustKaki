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
  dom = new JSDOM("<!doctype html><html><body></body></html>");
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
  expect(JSON.parse(fetcher.mock.calls[1][1].body).clientMessageId).toBe(JSON.parse(fetcher.mock.calls[0][1].body).clientMessageId);
});
