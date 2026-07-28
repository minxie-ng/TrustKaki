import { act, createElement, useState } from "react";
// @ts-expect-error jsdom intentionally ships without TypeScript declarations.
import { JSDOM } from "jsdom";
import { describe, expect, it, vi } from "vitest";
import type { FollowUpQueueItem } from "@/lib/types";
import {
  CaseUpdateForm,
  actionTypeForCaseAction,
  availableCaseActions,
  canSaveCaseAction,
  caseActionSubmissionIssue,
  caseMutationMessage,
  conflictRecoveryControls,
  feedbackAriaForRequestState,
  initialCaseAction,
  reconcileCaseAction,
  nextConflictRecoveryState,
  notifyCaseSaved,
  outcomeForCaseAction,
  notificationCategoryForEscalation,
  resolveConflictRefresh,
} from "./CaseUpdateForm";

const pendingItem: FollowUpQueueItem = {
  id: "queue-1",
  seniorId: "senior-1",
  seniorName: "Uncle Tan",
  riskLevel: "yellow",
  headline: "Follow up",
  reason: "Missed lunch.",
  changeFromUsual: "Usually eats by noon.",
  lastResponseAt: "2026-07-28T06:00:00.000Z",
  recommendedAction: "Call today.",
  status: "pending",
  assignedTo: null,
  lastUpdatedAt: "2026-07-28T07:00:00.000Z",
  priority: 1,
  relatedPatterns: [],
};

describe("case update semantics", () => {
  it("rejects a snooze after authoritative state becomes escalated", () => {
    expect(caseActionSubmissionIssue("escalated", "snooze")).toBe(
      "This action is no longer available for the latest case state. Choose another action."
    );
    expect(reconcileCaseAction("escalated", "snooze")).toBe("record_outcome");
  });

  it("keeps an action selected when it remains valid after refresh", () => {
    expect(caseActionSubmissionIssue("escalated", "resolve")).toBeNull();
    expect(reconcileCaseAction("escalated", "resolve")).toBe("resolve");
  });

  it("defines bounded live-region semantics for async feedback", () => {
    expect(feedbackAriaForRequestState("error")).toEqual({
      role: "alert",
      ariaLive: "assertive",
      ariaAtomic: true,
    });
    expect(feedbackAriaForRequestState("success")).toEqual({
      role: "status",
      ariaLive: "polite",
      ariaAtomic: true,
    });
  });

  it("maps a stale write to the required shared-case conflict", () => {
    expect(caseMutationMessage(409)).toEqual({
      kind: "conflict",
      message: "Another caregiver changed this case. Review the latest state before saving again.",
    });
  });

  it("blocks saving and withholds review until authoritative refresh succeeds", () => {
    const refreshing = nextConflictRecoveryState("none", "conflict_detected");
    expect(refreshing).toBe("refreshing");
    expect(conflictRecoveryControls(refreshing)).toEqual({
      saveBlocked: true,
      showReview: false,
      showRetryRefresh: false,
      detail: "Refreshing the latest case state before review.",
    });

    const ready = nextConflictRecoveryState(refreshing, "refresh_succeeded");
    expect(conflictRecoveryControls(ready)).toEqual({
      saveBlocked: true,
      showReview: true,
      showRetryRefresh: false,
      detail: "Latest case state loaded. Review it before saving again.",
    });
    expect(nextConflictRecoveryState(ready, "review_completed")).toBe("none");
  });

  it("keeps saving blocked and offers retry when conflict refresh fails", () => {
    const failed = nextConflictRecoveryState("refreshing", "refresh_failed");

    expect(conflictRecoveryControls(failed)).toEqual({
      saveBlocked: true,
      showReview: false,
      showRetryRefresh: true,
      detail: "Could not refresh the latest case state. Retry refresh before reviewing or saving.",
    });
    expect(nextConflictRecoveryState(failed, "retry_refresh")).toBe("refreshing");
  });

  it("awaits authoritative conflict refresh and reports its outcome", async () => {
    expect(await resolveConflictRefresh(async () => undefined)).toBe(
      "ready_for_review"
    );
    expect(
      await resolveConflictRefresh(async () => {
        throw new Error("refresh_failed");
      })
    ).toBe("refresh_failed");
  });

  it("keeps ordinary post-save notification fire-and-forget safe", () => {
    let calls = 0;
    expect(() =>
      notifyCaseSaved(() => {
        calls += 1;
        throw new Error("refresh_failed");
      })
    ).not.toThrow();
    expect(calls).toBe(1);
  });

  it("always records a close action as resolved", () => {
    expect(outcomeForCaseAction("resolve", "needs_follow_up")).toBe("resolved");
  });

  it("keeps follow-up outcomes separate from closure", () => {
    expect(outcomeForCaseAction("record_outcome", "needs_follow_up")).toBe(
      "needs_follow_up"
    );
    expect(outcomeForCaseAction("snooze", "needs_follow_up")).toBeUndefined();
  });

  it("maps concise caregiver choices to existing audited commands", () => {
    expect(actionTypeForCaseAction("acknowledge")).toBe("mark_for_follow_up");
    expect(actionTypeForCaseAction("assign")).toBe("assign");
    expect(actionTypeForCaseAction("escalate")).toBe("escalate");
  });

  it("allows acknowledgement without a note and requires an assignment target", () => {
    expect(canSaveCaseAction("acknowledge", "", null)).toBe(true);
    expect(canSaveCaseAction("assign", "", null)).toBe(false);
    expect(canSaveCaseAction("assign", "", "caregiver-2")).toBe(true);
  });

  it("keeps meaningful notes mandatory for operational outcomes", () => {
    expect(canSaveCaseAction("record_outcome", "too short", null)).toBe(false);
    expect(
      canSaveCaseAction(
        "record_outcome",
        "Spoke to the senior and will call again tomorrow.",
        null
      )
    ).toBe(true);
    expect(canSaveCaseAction("snooze", "", null)).toBe(false);
    expect(canSaveCaseAction("escalate", "", null)).toBe(false);
    expect(canSaveCaseAction("resolve", "", null)).toBe(false);
  });

  it("removes invalid downgrade actions from an escalated case", () => {
    expect(availableCaseActions("escalated")).toEqual([
      "assign",
      "record_outcome",
      "escalate",
      "resolve",
    ]);
    expect(initialCaseAction("escalated")).toBe("record_outcome");
  });

  it("keeps existing pending and acknowledged actions available", () => {
    const expected = [
      "acknowledge",
      "assign",
      "record_outcome",
      "snooze",
      "escalate",
      "resolve",
    ];

    expect(availableCaseActions("pending")).toEqual(expected);
    expect(availableCaseActions("acknowledged")).toEqual(expected);
    expect(initialCaseAction("pending")).toBe("acknowledge");
    expect(initialCaseAction("acknowledged")).toBe("acknowledge");
  });

  it("uses urgent safety for emergency guidance", () => {
    expect(notificationCategoryForEscalation("emergency_guidance", "health_safety"))
      .toBe("urgent_safety");
    expect(notificationCategoryForEscalation("family_guardian", "health_safety"))
      .toBe("health_safety");
  });
});

describe("mounted case conflict recovery", () => {
  it("reconciles a stale snooze after 409 and never sends it against escalated state", async () => {
    const dom = new JSDOM("<!doctype html><html><body></body></html>");
    vi.stubGlobal("window", dom.window);
    vi.stubGlobal("document", dom.window.document);
    vi.stubGlobal("navigator", dom.window.navigator);
    vi.stubGlobal("HTMLElement", dom.window.HTMLElement);
    vi.stubGlobal("Event", dom.window.Event);
    (globalThis as typeof globalThis & {
      IS_REACT_ACT_ENVIRONMENT: boolean;
    }).IS_REACT_ACT_ENVIRONMENT = true;
    const container = document.createElement("div");
    document.body.append(container);
    const { createRoot } = await import("react-dom/client");
    const root = createRoot(container);
    const escalatedItem = {
      ...pendingItem,
      status: "escalated" as const,
      lastUpdatedAt: "2026-07-28T07:05:00.000Z",
    };
    const responses = [
      new Response(null, { status: 409 }),
      Response.json({
        persistence: { persisted: true },
        resultingStatus: "followed_up",
      }),
    ];
    const fetchMock = vi.fn(async (
      input: RequestInfo | URL,
      init?: RequestInit
    ) => {
      void input;
      void init;
      return responses.shift()!;
    });
    vi.stubGlobal("fetch", fetchMock);

    function ConflictHarness() {
      const [item, setItem] = useState<FollowUpQueueItem>(pendingItem);
      return createElement(CaseUpdateForm, {
        item,
        caregiverOptions: [],
        authToken: "token",
        disabled: false,
        onSaved: vi.fn(),
        onConflictRefresh: async () => {
          setItem(escalatedItem);
        },
        onUnauthorized: vi.fn(),
      });
    }

    await act(async () => root.render(createElement(ConflictHarness)));
    await act(async () => {
      container.querySelector<HTMLButtonElement>("button")!.click();
    });
    const actionSelect = container.querySelector<HTMLSelectElement>("select")!;
    await act(async () => {
      actionSelect.value = "snooze";
      actionSelect.dispatchEvent(new Event("change", { bubbles: true }));
    });
    const note = container.querySelector<HTMLTextAreaElement>("textarea")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        dom.window.HTMLTextAreaElement.prototype,
        "value"
      )!.set!.call(
        note,
        "Rachel will call again after the urgent case is handled."
      );
      note.dispatchEvent(new Event("input", { bubbles: true }));
      note.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Save")!
        .disabled
    ).toBe(false);
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Save")!
        .click();
    });
    expect(fetchMock).toHaveBeenCalledOnce();

    const refreshedAction = container.querySelector<HTMLSelectElement>("select")!;
    expect(refreshedAction.value).toBe("record_outcome");
    expect(
      Array.from(refreshedAction.options).map((option) => option.value)
    ).not.toContain("snooze");

    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Review latest state")!
        .click();
    });
    await act(async () => {
      Array.from(container.querySelectorAll("button"))
        .find((button) => button.textContent === "Save")!
        .click();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const submittedBodies = fetchMock.mock.calls.map(([, init]) =>
      JSON.parse(String((init as RequestInit).body))
    );
    expect(submittedBodies[0].actionType).toBe("snooze");
    expect(submittedBodies[1]).toMatchObject({
      actionType: "record_outcome",
      expectedUpdatedAt: escalatedItem.lastUpdatedAt,
    });

    act(() => root.unmount());
    container.remove();
    dom.window.close();
    vi.unstubAllGlobals();
  });
});
