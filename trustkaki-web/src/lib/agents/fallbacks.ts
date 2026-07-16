import type { ContextMemoryOutput } from "./contracts";

export function contextMemoryFallback(): ContextMemoryOutput {
  return { candidates: [] };
}
