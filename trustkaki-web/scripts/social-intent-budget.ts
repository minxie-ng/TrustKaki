import { reserveRequest, type ComparisonBudget } from "./agent-comparison-budget";

// Separate US$1 pilot. Prices checked 16 Oct 2026 from official model endpoints.
export function reserveSocialIntentRequest(state: ComparisonBudget, provider: "jev" | "openai", request: unknown, attemptLimit: 72 | 73 | 74 | 110 | 111 = 72): ComparisonBudget {
  if (!Number.isInteger(state.capMicroUsd) || state.capMicroUsd < 1 || state.capMicroUsd > 1_000_000 ||
      !Number.isInteger(state.reservedMicroUsd) || state.reservedMicroUsd < 0 || state.reservedMicroUsd > state.capMicroUsd ||
      !Number.isInteger(state.calls) || state.calls < 0) throw new Error("social_intent_invalid_budget");
  if (![72, 73, 74, 110, 111].includes(attemptLimit) || state.calls >= attemptLimit) throw new Error("social_intent_request_limit");
  if (provider === "openai") return reserveRequest(state, request);
  const body = request as { model?: unknown; state?: unknown; questions?: unknown } | null;
  if (!body || body.model !== "typesafe/jev-1.14" || !body.state || !body.questions ||
      Buffer.byteLength(JSON.stringify(body), "utf8") > 8192) throw new Error("social_intent_unpriced_request");
  // Reserve the full published context (262,144 tokens), not a tokenizer guess.
  // $0.042 per million input tokens; output tokens $0. No refund after failure.
  const reservation = Math.ceil(262144 * 0.042);
  if (state.reservedMicroUsd + reservation > state.capMicroUsd) throw new Error("social_intent_budget_exhausted");
  return { ...state, reservedMicroUsd: state.reservedMicroUsd + reservation, calls: state.calls + 1 };
}
