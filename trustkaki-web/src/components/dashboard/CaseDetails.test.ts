import { describe, expect, it } from "vitest";
import type { CaregiverActionItem } from "@/lib/types";
import { formatCaregiverActionHistory } from "./CaseDetails";

describe("formatCaregiverActionHistory", () => {
  it("keeps the authenticated actor distinct from the assignment target", () => {
    const action: CaregiverActionItem = {
      id: "action-1",
      actionType: "assign",
      outcomeType: null,
      escalationDestination: null,
      caregiver: "Gate 1 Caregiver A",
      assignedCaregiver: "Gate 1 Caregiver B",
      note: null,
      createdAt: "2026-07-14T03:52:00.000Z",
    };

    expect(formatCaregiverActionHistory(action)).toContain(
      "assign to Gate 1 Caregiver B · by Gate 1 Caregiver A"
    );
  });
});
