import { describe, expect, it } from "vitest";
import { outcomeForCaseAction } from "./CaseUpdateForm";

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
});
