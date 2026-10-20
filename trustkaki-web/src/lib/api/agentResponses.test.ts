import { describe, expect, it } from "vitest";
import { agentResponseForRole } from "./agentResponses";

describe("agent response authority", () => {
  it.each([undefined, null, "caregiver", "org_admin", "DEMO_ADMIN"])(
    "keeps unknown and non-demo roles restricted (%s)", role => {
      const response = agentResponseForRole({
        data: { responseMessage: "Please check in" }, fallback: true,
        input: "private context", futureDiagnostic: "private future field",
        persistence: { persisted: true },
      }, role);
      expect(response.data).toEqual({ responseMessage: "Please check in" });
      expect(response.fallback).toBe(true);
      expect(response.persistence).toEqual({ persisted: true });
      expect(response).not.toHaveProperty("input");
      expect(response).not.toHaveProperty("futureDiagnostic");
    },
  );
});
