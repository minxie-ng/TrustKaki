import { describe, expect, it } from "vitest";
import {
  actionTypeForCaseAction,
  availableCaseActions,
  canSaveCaseAction,
  initialCaseAction,
  outcomeForCaseAction,
} from "./CaseUpdateForm";

describe("case update semantics", () => {
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
});
