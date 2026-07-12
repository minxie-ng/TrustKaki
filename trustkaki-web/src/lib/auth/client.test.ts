import { describe, expect, it } from "vitest";
import {
  authHeader,
  canShowDemoControls,
  publicUserRole,
} from "./client";

describe("client auth helpers", () => {
  it("builds a bearer auth header from a Supabase access token", () => {
    expect(authHeader("token-123")).toEqual({
      Authorization: "Bearer token-123",
    });
    expect(authHeader(null)).toEqual({});
  });

  it("shows demo controls only for demo_admin app metadata", () => {
    expect(canShowDemoControls({ role: "demo_admin" })).toBe(true);
    expect(canShowDemoControls({ role: "caregiver" })).toBe(false);
    expect(canShowDemoControls(null)).toBe(false);
  });

  it("extracts a public role from app metadata only", () => {
    expect(publicUserRole({ app_metadata: { role: "demo_admin" } })).toBe(
      "demo_admin"
    );
    expect(publicUserRole({ app_metadata: {}, user_metadata: { role: "demo_admin" } }))
      .toBe(null);
  });
});
