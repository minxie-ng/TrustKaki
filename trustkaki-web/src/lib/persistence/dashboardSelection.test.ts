import { describe, expect, it } from "vitest";
import { selectDashboardSeniorId } from "./dashboardSelection";

describe("selectDashboardSeniorId", () => {
  it("uses the requested senior when the caregiver can access it", () => {
    expect(
      selectDashboardSeniorId({
        accessibleSeniorIds: ["senior-1", "senior-2"],
        requestedSeniorId: "senior-2",
        preferredSeniorId: "senior-1",
      })
    ).toBe("senior-2");
  });

  it("rejects an inaccessible requested senior", () => {
    expect(() =>
      selectDashboardSeniorId({
        accessibleSeniorIds: ["senior-1"],
        requestedSeniorId: "senior-2",
        preferredSeniorId: "senior-1",
      })
    ).toThrow("Forbidden");
  });

  it("defaults to the preferred demo senior when accessible", () => {
    expect(
      selectDashboardSeniorId({
        accessibleSeniorIds: ["senior-2", "senior-1"],
        requestedSeniorId: null,
        preferredSeniorId: "senior-1",
      })
    ).toBe("senior-1");
  });

  it("defaults to the first accessible senior when the preferred senior is absent", () => {
    expect(
      selectDashboardSeniorId({
        accessibleSeniorIds: ["senior-2", "senior-3"],
        requestedSeniorId: null,
        preferredSeniorId: "senior-1",
      })
    ).toBe("senior-2");
  });
});
