import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
import { resolveQueueRiskLevel } from "./dashboardRepository";

describe("proactive caregiver queue presentation", () => {
  it("uses operational Yellow without rewriting the senior policy risk", () => {
    expect(resolveQueueRiskLevel("green", "yellow")).toBe("yellow");
    expect(resolveQueueRiskLevel("red", null)).toBe("red");
  });
});
