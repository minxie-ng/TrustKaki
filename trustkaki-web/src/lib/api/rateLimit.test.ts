import { beforeEach, describe, expect, it } from "vitest";
import { checkRateLimit, resetRateLimits } from "./rateLimit";

describe("in-process route rate limiter", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("allows requests until the configured limit is exceeded", () => {
    expect(
      checkRateLimit({ key: "user-1", route: "demo", limit: 2, windowMs: 1000 })
        .allowed
    ).toBe(true);
    expect(
      checkRateLimit({ key: "user-1", route: "demo", limit: 2, windowMs: 1000 })
        .allowed
    ).toBe(true);

    const third = checkRateLimit({
      key: "user-1",
      route: "demo",
      limit: 2,
      windowMs: 1000,
    });

    expect(third.allowed).toBe(false);
    expect(third.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it("keys limits by user and route", () => {
    checkRateLimit({ key: "user-1", route: "demo", limit: 1, windowMs: 1000 });

    expect(
      checkRateLimit({ key: "user-2", route: "demo", limit: 1, windowMs: 1000 })
        .allowed
    ).toBe(true);
    expect(
      checkRateLimit({ key: "user-1", route: "agent", limit: 1, windowMs: 1000 })
        .allowed
    ).toBe(true);
  });
});
