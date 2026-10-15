// GPT-4o mini standard token pricing checked in official model docs, 15 Oct 2026.
// Keep this guard specific to the owner-approved US$1 fictional comparison.
export interface ComparisonBudget {
  capMicroUsd: number;
  reservedMicroUsd: number;
  calls: number;
}

export function reserveRequest(state: ComparisonBudget, request: unknown): ComparisonBudget {
  if (!Number.isInteger(state.capMicroUsd) || state.capMicroUsd < 1 || state.capMicroUsd > 1_000_000 ||
      !Number.isInteger(state.reservedMicroUsd) || state.reservedMicroUsd < 0 ||
      !Number.isInteger(state.calls) || state.calls < 0) throw new Error("comparison_invalid_budget");
  const body = request as { model?: unknown; messages?: unknown; max_tokens?: unknown } | null;
  if (!body || body.model !== "gpt-4o-mini-2024-07-18" || !Array.isArray(body.messages) ||
      typeof body.max_tokens !== "number" || !Number.isInteger(body.max_tokens) ||
      body.max_tokens < 1 || body.max_tokens > 1024) throw new Error("comparison_request_not_allowed");
  if (state.calls >= 250) throw new Error("comparison_request_limit");
  // UTF-8 bytes bound BPE content tokens; ample additional allowance for message framing.
  const inputBound = Buffer.byteLength(JSON.stringify(body.messages), "utf8") + 2048;
  const reservation = Math.ceil(inputBound * 0.15 + body.max_tokens * 0.60);
  if (state.reservedMicroUsd + reservation > state.capMicroUsd) throw new Error("comparison_budget_exhausted");
  return { ...state, reservedMicroUsd: state.reservedMicroUsd + reservation, calls: state.calls + 1 };
}
