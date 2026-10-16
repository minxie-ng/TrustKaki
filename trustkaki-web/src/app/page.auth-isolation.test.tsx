import { act, createElement } from "react";
import type { Root } from "react-dom/client";
// @ts-expect-error jsdom intentionally ships without TypeScript declarations.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({ listener: null as null | ((event: string, session: unknown) => void), signOut: vi.fn(), getSession: vi.fn() }));
const views = vi.hoisted(() => ({ guide: {} as Record<string, (...args: never[]) => unknown>, dashboard: {} as Record<string, (...args: never[]) => unknown> }));
const session = (name: string) => ({ access_token: `token-${name}`, user: { id: name, app_metadata: { role: name === "admin" ? "demo_admin" : "caregiver" } } });
vi.mock("@/lib/supabase/browser", () => ({ createTrustKakiBrowserClient: () => ({ auth: {
  getSession: auth.getSession,
  onAuthStateChange: (listener: typeof auth.listener) => { auth.listener = listener; return { data: { subscription: { unsubscribe() {} } } }; },
  signOut: auth.signOut,
} }) }));
vi.mock("@/lib/supabase/dashboardRealtime", () => ({ subscribeToDashboardChanges: () => null }));
vi.mock("@/components/AppShell", () => ({ default: ({ children }: { children: React.ReactNode }) => children }));
vi.mock("@/components/Dashboard", () => ({ default: (props: { data: { senior: { name: string } }; contactPlan: unknown; seniorContext: unknown }) => { views.dashboard = props as unknown as typeof views.dashboard; const { data, contactPlan, seniorContext } = props; return createElement("div", { "data-senior": data.senior.name }, data.senior.name, JSON.stringify({ contactPlan, seniorContext })); } }));
vi.mock("@/components/dashboard/DemoGuide", () => ({ DemoGuide: (props: { children: React.ReactNode }) => { views.guide = props as unknown as typeof views.guide; return props.children; } }));
vi.mock("@/components/SignInForm", () => ({ default: () => createElement("div", null, "Sign in") }));
vi.mock("@/components/ChatSimulation", () => ({ default: () => null }));
vi.mock("@/components/AgentTracePanel", () => ({ default: () => null }));
import Home from "./page";

let dom: JSDOM, root: Root, container: HTMLDivElement;
beforeEach(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost" });
  for (const [key, value] of Object.entries({ window: dom.window, document: dom.window.document, navigator: dom.window.navigator, HTMLElement: dom.window.HTMLElement, Event: dom.window.Event })) vi.stubGlobal(key, value);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.useFakeTimers();
  auth.signOut.mockResolvedValue({ error: null });
  auth.getSession.mockResolvedValue({ data: { session: session("admin") } });
  container = document.createElement("div"); document.body.append(container);
  root = (await import("react-dom/client")).createRoot(container);
  vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => { act(() => root.unmount()); dom.window.close(); vi.useRealTimers(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const dashboard = (name: string) => Response.json({ data: { senior: { name, riskLevel: "green" }, selectedSeniorId: `senior-${name}`, activeSessions: [], seniors: [], followUpQueue: [] }, traces: [], briefing: null });
const flush = async () => { await act(async () => { await vi.advanceTimersByTimeAsync(1); }); };

it.each([200, 401])("discards old-session dashboard responses (%s) and starts the new account without an old senior selection", async status => {
  let finishOld!: (response: Response) => void;
  let adminDashboardCalls = 0;
  const request = vi.fn(async (url: string, options: RequestInit) => {
    const token = (options.headers as Record<string, string>).Authorization;
    if (url.startsWith("/api/dashboard/state")) {
      if (token === "Bearer token-admin") {
        adminDashboardCalls++;
        if (adminDashboardCalls === 1) return dashboard("admin");
        return new Promise<Response>(resolve => { finishOld = resolve; });
      }
      return url.includes("senior-admin") ? new Response(null, { status: 403 }) : dashboard("caregiver");
    }
    return Response.json({ contactPlan: null, context: null, schedule: null });
  });
  vi.stubGlobal("fetch", request);
  await act(async () => { root.render(createElement(Home)); }); await flush();
  expect(container.textContent).toContain("admin");
  await act(async () => { window.dispatchEvent(new Event("focus")); });
  expect(finishOld).toBeTypeOf("function");
  await act(async () => { auth.listener!("SIGNED_OUT", null); });
  expect(container.textContent).not.toContain("admin");
  await act(async () => { auth.listener!("SIGNED_IN", session("caregiver")); }); await flush();
  await act(async () => { finishOld(status === 200 ? dashboard("admin") : new Response(null, { status: 401 })); });
  expect(container.querySelector("[data-senior]")?.getAttribute("data-senior")).toBe("caregiver");
  expect(container.textContent).not.toContain("admin");
  expect(auth.signOut).not.toHaveBeenCalled();
  const caregiverRequests = request.mock.calls.filter(([, options]) => (options.headers as Record<string, string>).Authorization === "Bearer token-caregiver");
  expect(caregiverRequests.some(([url]) => url === "/api/dashboard/state")).toBe(true);
  expect(caregiverRequests.some(([url]) => url.includes("senior-admin"))).toBe(false);
});

it("ignores an initial session snapshot that resolves after a newer auth event", async () => {
  let finishInitial!: (value: unknown) => void;
  auth.getSession.mockImplementation(() => new Promise(resolve => { finishInitial = resolve; }));
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => {
    const token = (options.headers as Record<string, string>).Authorization;
    return dashboard(token === "Bearer token-caregiver" ? "caregiver" : "admin");
  }));
  await act(async () => { root.render(createElement(Home)); });
  await act(async () => { auth.listener!("SIGNED_IN", session("caregiver")); });
  await act(async () => { finishInitial({ data: { session: session("admin") } }); }); await flush();
  expect(container.querySelector("[data-senior]")?.getAttribute("data-senior")).toBe("caregiver");
  expect(container.textContent).not.toContain("admin");
});

it("ignores callbacks retained by children of a previous account", async () => {
  const request = vi.fn(async (_url: string, options: RequestInit) => {
    const token = (options.headers as Record<string, string>).Authorization;
    return dashboard(token === "Bearer token-caregiver" ? "caregiver" : "admin");
  });
  vi.stubGlobal("fetch", request);
  await act(async () => { root.render(createElement(Home)); }); await flush();
  const oldGuide = views.guide;
  const oldDashboard = views.dashboard;
  await act(async () => { auth.listener!("SIGNED_IN", session("caregiver")); }); await flush();
  const count = request.mock.calls.length;
  await act(async () => {
    oldGuide.onDataChange({ senior: { name: "admin", riskLevel: "green" }, selectedSeniorId: "senior-admin" } as never);
    oldDashboard.onSeniorContextChanged({ leaked: "admin" } as never);
    oldDashboard.onUnauthorized();
    await oldDashboard.onRefresh();
    oldDashboard.onRefreshContactPlan();
    oldDashboard.onRefreshCheckInSchedule();
  });
  expect(request.mock.calls.length).toBe(count);
  expect(auth.signOut).not.toHaveBeenCalled();
  expect(container.querySelector("[data-senior]")?.getAttribute("data-senior")).toBe("caregiver");
  expect(container.textContent).not.toContain("admin");
});
