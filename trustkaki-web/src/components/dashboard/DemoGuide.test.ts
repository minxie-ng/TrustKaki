import { act, createElement } from "react";
import type { Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
// @ts-expect-error jsdom intentionally ships without TypeScript declarations.
import { JSDOM } from "jsdom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardData, FollowUpQueueItem } from "@/lib/types";
import { DemoGuide } from "./DemoGuide";
import type { DemoPhase } from "./demoGuideState";

const queueItem: FollowUpQueueItem = {
  id: "queue-1",
  seniorId: "senior-1",
  seniorName: "Mr Tan Ah Hock",
  riskLevel: "yellow",
  headline: "Follow-up suggested",
  reason: "Mobility, appetite, and routine changes across four days.",
  changeFromUsual: "Different from his usual morning routine.",
  lastResponseAt: "2026-07-10T08:00:00.000Z",
  recommendedAction: "Call today and check whether he needs meal support.",
  status: "pending",
  assignedTo: null,
  lastUpdatedAt: "2026-07-11T08:00:00.000Z",
  priority: 100,
  relatedPatterns: [],
  pattern: {
    id: "pattern-1",
    type: "combined_wellbeing_decline",
    status: "active",
    severity: "medium",
    conciseSummary: "Pattern summary",
    recommendedAction: "Call today.",
    firstObservedAt: "2026-07-07T08:00:00.000Z",
    latestObservedAt: "2026-07-10T08:00:00.000Z",
    evidence: [
      {
        id: "signal-1",
        type: "health",
        severity: "medium",
        description: "Knee discomfort",
        observedAt: "2026-07-07T08:00:00.000Z",
      },
    ],
    triggerExplanation: "Deterministic pattern trigger",
    comparison: "Changed from usual routine",
    previousActions: [],
  },
};

function data(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    senior: {
      name: "Mr Tan Ah Hock",
      age: 76,
      gender: "Male",
      livingSituation: "Lives alone",
      caregiver: "Rachel",
      aacVolunteer: "Mei Ling",
      riskLevel: "yellow",
      lastCheckIn: "2026-07-10T08:00:00.000Z",
    },
    activeSessions: [],
    recentAlerts: [],
    followUpQueue: [queueItem],
    activity: [],
    ...overrides,
  };
}

function renderGuide(phase: DemoPhase, error: string | null = null) {
  return renderToStaticMarkup(
    createElement(
      DemoGuide,
      {
        enabled: true,
        phase,
        error,
        data: data(),
        authToken: "test-token",
        onPhaseChange: vi.fn(),
        onErrorChange: vi.fn(),
        onRefresh: async () => data(),
        onOpenTimeline: vi.fn(),
        onUnauthorized: vi.fn(),
        onExit: vi.fn(),
      },
      createElement("div", null, "Care workspace")
    )
  );
}

describe("DemoGuide rendering", () => {
  it("never renders orientation and workspace together", () => {
    const html = renderGuide("orientation");

    expect(html).toContain("Start guided demo");
    expect(html).toContain("About 90 seconds");
    expect(html).not.toContain("Care workspace");
  });

  it.each<DemoPhase>(["prepare", "review", "respond", "resolve"])(
    "renders one coral primary action in %s",
    (phase) => {
      const html = renderGuide(phase);

      expect((html.match(/data-demo-primary="true"/g) ?? [])).toHaveLength(1);
      expect(html).toContain("Care workspace");
      expect(html).toContain("Exit guided demo");
    }
  );

  it("relabels the same sole primary action after failure", () => {
    const html = renderGuide(
      "prepare",
      "The demo data has not refreshed yet. Retry preparation."
    );

    expect((html.match(/data-demo-primary="true"/g) ?? [])).toHaveLength(1);
    expect(html).toContain("Retry preparation");
  });

  it("recedes completed steps into a compact progress summary", () => {
    expect(renderGuide("review")).toContain("1 of 4 complete");
    expect(renderGuide("resolve")).toContain("3 of 4 complete");
    expect(renderGuide("complete")).toContain("4 of 4 complete");
  });
});

let container: HTMLDivElement;
let root: Root;
let dom: JSDOM;

beforeEach(async () => {
  dom = new JSDOM("<!doctype html><html><body></body></html>");
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("navigator", dom.window.navigator);
  vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
  vi.stubGlobal("Event", dom.window.Event);
  vi.stubGlobal("crypto", {
    randomUUID: vi
      .fn()
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000101")
      .mockReturnValueOnce("00000000-0000-4000-8000-000000000102"),
  });
  (globalThis as typeof globalThis & {
    IS_REACT_ACT_ENVIRONMENT: boolean;
  }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  const { createRoot } = await import("react-dom/client");
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  dom.window.close();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

async function renderInteractiveGuide({
  phase,
  refreshedData,
  fetchMock,
  initialData = data(),
  onPhaseChange = vi.fn<(phase: DemoPhase) => void>(),
  onErrorChange = vi.fn<(error: string | null) => void>(),
  onRefresh = vi.fn(async () => refreshedData),
  onUnauthorized = vi.fn(),
}: {
  phase: DemoPhase;
  refreshedData: DashboardData;
  fetchMock: ReturnType<typeof vi.fn>;
  initialData?: DashboardData;
  onPhaseChange?: (phase: DemoPhase) => void;
  onErrorChange?: (error: string | null) => void;
  onRefresh?: (seniorId?: string | null) => Promise<DashboardData | null>;
  onUnauthorized?: () => void;
}) {
  vi.stubGlobal("fetch", fetchMock);
  const render = async (
    nextPhase: DemoPhase,
    nextData: DashboardData = initialData
  ) => act(async () => {
    root.render(
      createElement(
        DemoGuide,
        {
          enabled: true,
          phase: nextPhase,
          error: null,
          data: nextData,
          authToken: "test-token",
          onPhaseChange,
          onErrorChange,
          onRefresh,
          onOpenTimeline: vi.fn(),
          onUnauthorized,
          onExit: vi.fn(),
        },
        createElement("div", null, "Care workspace")
      )
    );
  });
  await render(phase);
  return {
    onPhaseChange,
    onErrorChange,
    onRefresh,
    onUnauthorized,
    rerender: render,
  };
}

describe("DemoGuide route wiring", () => {
  it("keeps prepare active when the authoritative refresh is stale", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ queue: [queueItem] })
    );
    const { onPhaseChange } = await renderInteractiveGuide({
      phase: "prepare",
      refreshedData: data({ followUpQueue: [] }),
      fetchMock,
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-demo-primary="true"]')!
        .click();
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/demo/pattern-watch/quick",
      expect.objectContaining({ method: "POST" })
    );
    expect(onPhaseChange).not.toHaveBeenCalled();
  });

  it("refreshes and verifies the senior returned by the preparation route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      Response.json({ queue: [queueItem] })
    );
    const onRefresh = vi.fn(async () => data());

    await renderInteractiveGuide({
      phase: "prepare",
      refreshedData: data(),
      fetchMock,
      onRefresh,
    });
    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-demo-primary="true"]')!
        .click();
    });

    expect(onRefresh).toHaveBeenCalledWith("senior-1");
  });

  it("posts the controlled response through the existing queue route", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const { onPhaseChange } = await renderInteractiveGuide({
      phase: "respond",
      refreshedData: data({
        followUpQueue: [{ ...queueItem, status: "acknowledged" }],
        activity: [
          {
            id: "activity-1",
            queueItemId: "queue-1",
            seniorId: "senior-1",
            actionType: "record_outcome",
            outcomeType: "needs_follow_up",
            previousStatus: "pending",
            resultingStatus: "acknowledged",
            note: "Rachel spoke with Mr Tan and will check again this evening.",
            caregiver: "Rachel",
            createdAt: "2026-07-11T09:00:00.000Z",
          },
        ],
      }),
      fetchMock,
    });

    await act(async () => {
      container
        .querySelector<HTMLButtonElement>('[data-demo-primary="true"]')!
        .click();
    });

    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body));
    expect(body).toMatchObject({
      queueItemId: "queue-1",
      commandId: "00000000-0000-4000-8000-000000000101",
      expectedUpdatedAt: queueItem.lastUpdatedAt,
      actionType: "record_outcome",
      outcomeType: "needs_follow_up",
    });
    expect(onPhaseChange).toHaveBeenCalledWith("resolve");
  });

  it("calls the existing unauthorized handler for a 401 response", async () => {
    const onUnauthorized = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 401 }));
    const { onPhaseChange } = await renderInteractiveGuide({
      phase: "respond",
      refreshedData: data(),
      fetchMock,
      onUnauthorized,
    });

    await clickPrimary();

    expect(onUnauthorized).toHaveBeenCalledOnce();
    expect(onPhaseChange).not.toHaveBeenCalled();
  });

  it("retains the phase and refreshes authoritative state after a 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 409 }));
    const onErrorChange = vi.fn();
    const onRefresh = vi.fn(async () =>
      data({
        followUpQueue: [
          { ...queueItem, lastUpdatedAt: "2026-07-11T08:30:00.000Z" },
        ],
      })
    );
    const { onPhaseChange } = await renderInteractiveGuide({
      phase: "respond",
      refreshedData: data(),
      fetchMock,
      onErrorChange,
      onRefresh,
    });

    await clickPrimary();

    expect(onPhaseChange).not.toHaveBeenCalled();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(onErrorChange).toHaveBeenLastCalledWith(
      "The case changed while you were reviewing it. Retry this step with the latest state."
    );
  });

  it("reuses a command ID for an ordinary retry", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 500 }));
    await renderInteractiveGuide({
      phase: "respond",
      refreshedData: data(),
      fetchMock,
    });

    await clickPrimary();
    await clickPrimary();

    const first = requestBody(fetchMock, 0);
    const second = requestBody(fetchMock, 1);
    expect(second.commandId).toBe(first.commandId);
  });

  it("creates a new command ID after a 409 and retries against refreshed state", async () => {
    const latestUpdatedAt = "2026-07-11T08:30:00.000Z";
    const refreshedPending = data({
      followUpQueue: [{ ...queueItem, lastUpdatedAt: latestUpdatedAt }],
    });
    const refreshedAcknowledged = data({
      followUpQueue: [
        {
          ...queueItem,
          status: "acknowledged",
          lastUpdatedAt: "2026-07-11T09:00:00.000Z",
        },
      ],
      activity: [responseActivity()],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 409 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const onRefresh = vi
      .fn()
      .mockResolvedValueOnce(refreshedPending)
      .mockResolvedValueOnce(refreshedAcknowledged);
    const { onPhaseChange } = await renderInteractiveGuide({
      phase: "respond",
      refreshedData: refreshedAcknowledged,
      fetchMock,
      onRefresh,
    });

    await clickPrimary();
    await clickPrimary();

    const first = requestBody(fetchMock, 0);
    const second = requestBody(fetchMock, 1);
    expect(second.commandId).not.toBe(first.commandId);
    expect(second.expectedUpdatedAt).toBe(latestUpdatedAt);
    expect(onPhaseChange).toHaveBeenCalledWith("resolve");
  });

  it("uses the authoritative post-response version when resolving", async () => {
    const postResponseUpdatedAt = "2026-07-11T09:00:00.000Z";
    const acknowledged = data({
      followUpQueue: [
        {
          ...queueItem,
          status: "acknowledged",
          lastUpdatedAt: postResponseUpdatedAt,
        },
      ],
      activity: [responseActivity()],
    });
    const resolved = data({
      followUpQueue: [],
      activity: [responseActivity(), resolvedActivity()],
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }));
    const onRefresh = vi
      .fn()
      .mockResolvedValueOnce(acknowledged)
      .mockResolvedValueOnce(resolved);
    const guide = await renderInteractiveGuide({
      phase: "respond",
      refreshedData: acknowledged,
      fetchMock,
      onRefresh,
    });

    await clickPrimary();
    await guide.rerender("resolve");
    await clickPrimary();

    expect(requestBody(fetchMock, 1).expectedUpdatedAt).toBe(
      postResponseUpdatedAt
    );
  });

  it("completes Resolve only after queue removal and retained resolved activity", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const incomplete = data({ followUpQueue: [], activity: [] });
    const first = await renderInteractiveGuide({
      phase: "resolve",
      refreshedData: incomplete,
      fetchMock,
      initialData: data({
        followUpQueue: [{ ...queueItem, status: "acknowledged" }],
      }),
    });

    await clickPrimary();
    expect(first.onPhaseChange).not.toHaveBeenCalled();

    const verified = data({
      followUpQueue: [],
      activity: [resolvedActivity()],
    });
    const secondFetch = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    const second = await renderInteractiveGuide({
      phase: "resolve",
      refreshedData: verified,
      fetchMock: secondFetch,
      initialData: data({
        followUpQueue: [{ ...queueItem, status: "acknowledged" }],
      }),
    });

    await clickPrimary();
    expect(second.onPhaseChange).toHaveBeenCalledWith("complete");
  });
});

async function clickPrimary() {
  await act(async () => {
    container
      .querySelector<HTMLButtonElement>('[data-demo-primary="true"]')!
      .click();
  });
}

function requestBody(fetchMock: ReturnType<typeof vi.fn>, index: number) {
  return JSON.parse(String(fetchMock.mock.calls[index][1].body)) as {
    commandId: string;
    expectedUpdatedAt: string;
  };
}

function responseActivity() {
  return {
    id: "activity-response",
    queueItemId: "queue-1",
    seniorId: "senior-1",
    actionType: "record_outcome" as const,
    outcomeType: "needs_follow_up" as const,
    previousStatus: "pending" as const,
    resultingStatus: "acknowledged" as const,
    note: "Rachel spoke with Mr Tan and will check again this evening.",
    caregiver: "Rachel",
    createdAt: "2026-07-11T09:00:00.000Z",
  };
}

function resolvedActivity() {
  return {
    id: "activity-resolved",
    queueItemId: "queue-1",
    seniorId: "senior-1",
    actionType: "resolve" as const,
    outcomeType: "resolved" as const,
    previousStatus: "acknowledged" as const,
    resultingStatus: "resolved" as const,
    note: "Rachel confirmed Mr Tan is safe and the follow-up is complete.",
    caregiver: "Rachel",
    createdAt: "2026-07-11T09:05:00.000Z",
  };
}
