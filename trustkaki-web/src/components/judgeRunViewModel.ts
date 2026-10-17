import { z } from "zod";
import type { AgentTrace } from "@/lib/types";

const agentIdSchema = z.enum(["orchestrator", "triage", "policy", "daily_living", "health_frailty", "aac_nudge", "digital_safety", "briefing", "context_memory", "pattern_watch"]);
const traceSchema = z.object({
  id: z.string(), agentId: agentIdSchema, agentName: z.string(), timestamp: z.string(),
  input: z.string(), reasoning: z.string(), output: z.string(), tags: z.array(z.string()),
  durationMs: z.number().optional(), modelUsed: z.string().optional(), fallback: z.boolean().optional(),
  inputSummary: z.string().optional(), outputSummary: z.string().optional(), stateChanges: z.array(z.string()).optional(), errorMessage: z.string().nullable().optional(),
});
export const judgeRunSchema = z.object({
  messages: z.array(z.object({ text: z.string(), agentId: agentIdSchema.optional() })),
  traces: z.array(traceSchema),
  riskLevel: z.enum(["green", "yellow", "red"]),
  retrieval: z.object({ status: z.enum(["available", "empty", "unavailable", "not_recorded"]), items: z.array(z.object({ content: z.string(), source: z.string(), confirmedAt: z.string() })) }).optional(),
  persistence: z.object({ persisted: z.boolean(), replayed: z.boolean().optional(), memory: z.object({ accepted: z.number(), rejected: z.number(), failed: z.number() }).optional() }).optional(),
});
export type JudgeRun = z.infer<typeof judgeRunSchema>;

const specialistNames: Record<string, string> = { context_memory: "Personal context", digital_safety: "Digital safety", aac_nudge: "Community activities" };
export function recordedRouting(trace: AgentTrace) {
  if (trace.agentName !== "Jev Specialist Router" && trace.agentName !== "Jev Routing Shadow") return null;
  try {
    const value = JSON.parse(trace.output);
    if (!value || !["active", "shadow"].includes(value.mode)) return null;
    const list = (items: unknown) => Array.isArray(items) ? items.filter((item): item is string => typeof item === "string").map((item) => specialistNames[item] ?? item.replaceAll("_", " ")).join(", ") || "None" : "Not recorded";
    return { mode: value.mode === "active" ? "Active routing" : "Shadow observation", requested: list(value.requestedSpecialists), executed: list(value.executedSpecialists), blocked: list(value.blockedSpecialists), overrides: list(value.independentOverrides) };
  } catch { return null; }
}
