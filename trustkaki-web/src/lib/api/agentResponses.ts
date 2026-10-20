/** Keep model diagnostics behind the same demo authority as dashboard traces. */
export function agentResponseForRole<T extends { data: unknown }>(
  result: T,
  role: string | null | undefined,
) {
  if (role === "demo_admin") return result;
  // Allowlist care results so new diagnostic fields remain private by default.
  const value = result as T & {
    agentId?: unknown;
    agentName?: unknown;
    timestamp?: unknown;
    fallback?: unknown;
    trigger?: unknown;
    persistence?: unknown;
  };
  return {
    agentId: value.agentId,
    agentName: value.agentName,
    timestamp: value.timestamp,
    data: value.data,
    fallback: value.fallback,
    trigger: value.trigger,
    persistence: value.persistence,
  };
}
