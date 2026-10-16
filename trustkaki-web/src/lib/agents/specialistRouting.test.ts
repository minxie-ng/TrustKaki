import { describe, expect, it } from "vitest";
import { routingFlags, type RoutingJudgment } from "./routingContract";
import { selectSpecialistRouting } from "./specialistRouting";

const absent = Object.fromEntries(routingFlags.map(flag => [flag, "absent"])) as RoutingJudgment;
const baseline = { digitalSafety: false, contextMemory: false, social: false };

describe("bounded Jev specialist routing", () => {
  it.each(["present", "unclear"] as const)("routes %s safety to assessment", label => {
    expect(selectSpecialistRouting({ ...absent, digital_safety: label }, baseline, true).digitalSafety).toBe(true);
  });
  it("cannot veto any independent trigger", () => {
    expect(selectSpecialistRouting(absent, { digitalSafety: true, contextMemory: true, social: true }, true))
      .toMatchObject({ digitalSafety: true, contextMemory: true, social: true, carePause: false });
  });
  it("does not request durable extraction from uncertainty", () => {
    expect(selectSpecialistRouting({ ...absent, durable_context: "unclear" }, baseline, true).contextMemory).toBe(false);
  });
  it("adds memory/social requests without losing mixed intents", () => {
    expect(selectSpecialistRouting({ ...absent, durable_context: "present", social: "present" }, baseline, true))
      .toMatchObject({ contextMemory: true, social: true, requestedSpecialists: ["context_memory", "aac_nudge"] });
  });
  it("cannot bypass memory exclusion", () => {
    expect(selectSpecialistRouting({ ...absent, durable_context: "present" }, { ...baseline, contextMemory: true }, false).contextMemory).toBe(false);
  });
  it.each(["health", "daily_living", "urgent"] as const)("pauses social on %s present or unclear, never creates risk", flag => {
    for (const label of ["present", "unclear"] as const) {
      const decision = selectSpecialistRouting({ ...absent, [flag]: label }, baseline, true);
      expect(decision.carePause).toBe(true);
      expect(decision).not.toHaveProperty("riskLevel");
      expect(decision).not.toHaveProperty("signals");
    }
  });
  it("unavailable routing uses only independent triggers", () => {
    expect(selectSpecialistRouting(null, baseline, true))
      .toMatchObject({ ...baseline, requestedSpecialists: [], independentTriggers: [], carePause: false });
  });
});
