import { describe, expect, it } from "vitest";
import {
  TRUSTKAKI_PROJECT_REF,
  validateLiveProjectIdentity,
} from "./liveProjectGuard";

const expectedUrl = `https://${TRUSTKAKI_PROJECT_REF}.supabase.co`;

describe("TrustKaki live project guard", () => {
  it("accepts the exact linked project and configured host", () => {
    expect(() => validateLiveProjectIdentity({
      linkedProjectRef: ` ${TRUSTKAKI_PROJECT_REF}\n`,
      configuredUrls: [expectedUrl],
    })).not.toThrow();
  });

  it("rejects a different linked project", () => {
    expect(() => validateLiveProjectIdentity({
      linkedProjectRef: "wrong-project",
      configuredUrls: [expectedUrl],
    })).toThrow("linked project ref");
  });

  it("rejects a different configured host", () => {
    expect(() => validateLiveProjectIdentity({
      linkedProjectRef: TRUSTKAKI_PROJECT_REF,
      configuredUrls: ["https://wrong-project.supabase.co"],
    })).toThrow("configured project host");
  });

  it("rejects a deceptive suffix host", () => {
    expect(() => validateLiveProjectIdentity({
      linkedProjectRef: TRUSTKAKI_PROJECT_REF,
      configuredUrls: [`${expectedUrl}.example.com`],
    })).toThrow("configured project host");
  });

  it("rejects an invalid configured URL", () => {
    expect(() => validateLiveProjectIdentity({
      linkedProjectRef: TRUSTKAKI_PROJECT_REF,
      configuredUrls: ["not a URL"],
    })).toThrow("configured Supabase URL");
  });

  it("requires at least one configured URL", () => {
    expect(() => validateLiveProjectIdentity({
      linkedProjectRef: TRUSTKAKI_PROJECT_REF,
      configuredUrls: [],
    })).toThrow("requires a configured Supabase URL");
  });
});
