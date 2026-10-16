import { describe, expect, it } from "vitest";
import { reserveSocialIntentRequest } from "./social-intent-budget";
import { buildJevSocialIntentRequest } from "../src/lib/agents/evaluation/socialIntent";

const fresh = { capMicroUsd: 1_000_000, reservedMicroUsd: 0, calls: 0 };
const jev = { ...buildJevSocialIntentRequest("Any activities?"), model: "typesafe/jev-1.14" };
const openai = { model: "gpt-4o-mini-2024-07-18", messages: [{ role: "user", content: "test" }], max_tokens: 128 };
describe("separate social-intent budget", () => {
  it("requires explicit active-evaluation limit 110 and preserves the older default bound", () => {
    const near = { ...fresh, calls: 109, reservedMicroUsd: 500000 };
    expect(() => reserveSocialIntentRequest(near, "openai", openai)).toThrow("social_intent_request_limit");
    const last = reserveSocialIntentRequest(near, "openai", openai, 110);
    expect(last.calls).toBe(110);
    expect(() => reserveSocialIntentRequest(last, "openai", openai, 110)).toThrow("social_intent_request_limit");
  });
  it("enforces the separately approved recovery bound of 111", () => {
    const last = reserveSocialIntentRequest({ ...fresh, calls: 110 }, "openai", openai, 111);
    expect(last.calls).toBe(111);
    expect(() => reserveSocialIntentRequest(last, "openai", openai, 111)).toThrow();
  });
  it("stops the diagnostic recovery at 113 total attempts", () => {
    const last = reserveSocialIntentRequest({ ...fresh, calls: 112 }, "openai", openai, 113);
    expect(last.calls).toBe(113);
    expect(() => reserveSocialIntentRequest(last, "openai", openai, 113)).toThrow();
  });
  it("reserves a full Jev context before a call, even for short input", () => {
    expect(reserveSocialIntentRequest(fresh, "jev", jev)).toEqual({ ...fresh, calls: 1, reservedMicroUsd: 11011 });
  });
  it("retains prior reservations and fits the planned 72-request run", () => {
    let budget = fresh;
    for (let i = 0; i < 36; i++) {
      budget = reserveSocialIntentRequest(budget, "jev", jev);
      budget = reserveSocialIntentRequest(budget, "openai", openai);
    }
    expect(budget.calls).toBe(72);
    expect(budget.reservedMicroUsd).toBeLessThan(1_000_000);
    expect(() => reserveSocialIntentRequest(budget, "jev", jev)).toThrow("social_intent_request_limit");
  });
  it("refuses exhausted or corrupted budgets and unpriced requests", () => {
    expect(() => reserveSocialIntentRequest({ ...fresh, reservedMicroUsd: 999999 }, "jev", jev)).toThrow();
    expect(() => reserveSocialIntentRequest({ ...fresh, reservedMicroUsd: -1 }, "jev", jev)).toThrow();
    expect(() => reserveSocialIntentRequest(fresh, "jev", { ...jev, model: "typesafe/jev-router" })).toThrow();
    expect(() => reserveSocialIntentRequest(fresh, "openai", { ...openai, model: "gpt-4o" })).toThrow();
  });
  it("allows only one additional attempt under the approved recovery limit", () => {
    const budget = reserveSocialIntentRequest({ ...fresh, calls: 72, reservedMicroUsd: 500000 }, "openai", openai, 73);
    expect(budget.calls).toBe(73);
    expect(budget.reservedMicroUsd).toBeGreaterThan(500000);
    expect(() => reserveSocialIntentRequest(budget, "openai", openai, 73)).toThrow("social_intent_request_limit");
  });
});
