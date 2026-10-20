import { beforeEach, describe, expect, it, vi } from "vitest";
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
  it("bounds bucket memory without evicting active limits and recovers after expiry", () => {
    vi.useFakeTimers();
    try {
      for(let i=0;i<10000;i++) checkRateLimit({key:`user-${i}`,route:"bounded",limit:1,windowMs:1000});
      expect(checkRateLimit({key:"overflow",route:"bounded",limit:1,windowMs:1000}).allowed).toBe(false);
      expect(checkRateLimit({key:"user-0",route:"bounded",limit:1,windowMs:1000}).allowed).toBe(false);
      vi.advanceTimersByTime(1001);
      expect(checkRateLimit({key:"overflow",route:"bounded",limit:1,windowMs:1000}).allowed).toBe(true);
    } finally {vi.useRealTimers();}
  });

});
