import { AsyncLocalStorage } from "node:async_hooks";

interface Budget { controller: AbortController; endsAt: number; calls: number; maxCalls: number }
const budgets = new AsyncLocalStorage<Budget>();

/** Shared by all model stages in one orchestration; persistence runs outside it. */
export async function withInferenceBudget<T>(work: () => Promise<T>, options = { timeoutMs: 45_000, maxCalls: 12 }): Promise<T> {
  if (budgets.getStore()) return work();
  const budget: Budget = { controller: new AbortController(), endsAt: Date.now() + options.timeoutMs, calls: 0, maxCalls: options.maxCalls };
  const timer = setTimeout(() => budget.controller.abort(), options.timeoutMs);
  try { return await budgets.run(budget, work); }
  finally { clearTimeout(timer); budget.controller.abort(); }
}
export function remainingInferenceMs(): number {
  const budget = budgets.getStore();
  if (!budget) return Infinity;
  return budget.controller.signal.aborted || budget.calls >= budget.maxCalls ? 0 : Math.max(0, budget.endsAt - Date.now());
}
export function inferenceSignal(timeoutMs: number, modelCall = false): AbortSignal {
  const budget = budgets.getStore();
  if (budget && (budget.controller.signal.aborted || Date.now() >= budget.endsAt || (modelCall && budget.calls >= budget.maxCalls))) {
    throw new Error("Inference budget exhausted");
  }
  if (modelCall && budget) budget.calls++;
  const local = AbortSignal.timeout(timeoutMs);
  return budget ? AbortSignal.any([budget.controller.signal, local]) : local;
}
