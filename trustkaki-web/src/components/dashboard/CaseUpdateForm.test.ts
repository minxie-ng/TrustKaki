import { describe, expect, it } from "vitest";
import {
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
