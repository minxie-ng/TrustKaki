import { describe, expect, it } from "vitest";
import { reserveRequest, type ComparisonBudget } from "./agent-comparison-budget";

const budget = (): ComparisonBudget => ({ capMicroUsd: 1_000_000, reservedMicroUsd: 0, calls: 0 });

describe("fictional comparison spending guard", () => {
  it("reserves a conservative UTF-8 input bound and the complete output allowance", () => {
    const messages = [{ role: "user", content: "我喜欢用华语通话。" }];
    const next = reserveRequest(budget(), { model: "gpt-4o-mini-2024-07-18", messages, max_tokens: 1024 });
    expect(next.calls).toBe(1);
    expect(next.reservedMicroUsd).toBe(Math.ceil((Buffer.byteLength(JSON.stringify(messages)) + 2048) * 0.15 + 1024 * 0.60));
    expect(budget().reservedMicroUsd).toBe(0);
  });

  it("rejects before a request could exceed the cap, including retries", () => {
    expect(() => reserveRequest({ ...budget(), reservedMicroUsd: 999_999 }, { model: "gpt-4o-mini-2024-07-18", messages: [], max_tokens: 1024 })).toThrow("comparison_budget_exhausted");
  });

  it.each([
    { model: "other-model", messages: [], max_tokens: 1024 },
    { model: "gpt-4o-mini-2024-07-18", messages: [], max_tokens: 2048 },
    { model: "gpt-4o-mini-2024-07-18", messages: [], max_tokens: 0 },
    { model: "gpt-4o-mini-2024-07-18", messages: "bad", max_tokens: 1024 },
  ])("rejects unpriced or unbounded requests", request => {
    expect(() => reserveRequest(budget(), request)).toThrow("comparison_request_not_allowed");
  });

  it("enforces an independent request ceiling", () => {
    expect(() => reserveRequest({ ...budget(), calls: 250 }, { model: "gpt-4o-mini-2024-07-18", messages: [], max_tokens: 1024 })).toThrow("comparison_request_limit");
  });
});
