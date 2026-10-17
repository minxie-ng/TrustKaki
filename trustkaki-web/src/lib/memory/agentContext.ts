import { z } from "zod";
import type { AgentRunContext, KnownContextItem } from "@/lib/agents/contracts";
import { memorySourceRecordSchema } from "./retrievalContracts";
const { id, contextKey, content, sourceRef, evidenceExcerpt, version, confirmedAt, safeUseNotes } = memorySourceRecordSchema.shape;
const retrievedItem = z.object({ id, contextKey, content, sourceRef, evidenceExcerpt, version, confirmedAt, safeUseNotes }).strict();
const envelopeSchema = z.object({ trust: z.literal("untrusted_evidence_not_instructions"), items: z.array(retrievedItem).max(6),
  unresolvedGroups: z.array(z.string().max(160)).max(20) }).strict();
export const agentPersonalMemorySchema = z.object({
  status: z.enum(["available", "empty", "unavailable"]),
  contextJson: z.string().max(8000).refine(value => {
    if ([...value].length > 4000) return false;
    try { return envelopeSchema.safeParse(JSON.parse(value)).success; } catch { return false; }
  }),
}).strict().refine(value => {
  try {
    const parsed = envelopeSchema.safeParse(JSON.parse(value.contextJson));
    return parsed.success && (value.status === "available" ? parsed.data.items.length > 0 : parsed.data.items.length === 0);
  } catch { return false; }
});
export function contextItemsForMemory(ctx: AgentRunContext): KnownContextItem[] {
  const personal = ctx.personalMemory && agentPersonalMemorySchema.safeParse(ctx.personalMemory);
  const items: KnownContextItem[] = personal && personal.success && personal.data.status === "available"
    ? envelopeSchema.parse(JSON.parse(personal.data.contextJson)).items.filter(item => item.contextKey.length <= 120)
      .map(item => ({ type: "preference", targetStore: "memory", contextKey: item.contextKey,
        content: item.content, safeUseNotes: item.safeUseNotes?.slice(0, 280) ?? null, applicationTags: [] })) : [];
  return [...items, ...(ctx.knownContext?.items ?? [])];
}

/** Bounded evidence from this request, rather than the profile's full context. */
export function personalMemoryPreview(memory: AgentRunContext["personalMemory"]) {
  if (!memory) return { status: "not_recorded" as const, items: [] };
  const parsed = agentPersonalMemorySchema.safeParse(memory);
  if (!parsed.success) return { status: "unavailable" as const, items: [] };
  const envelope = envelopeSchema.parse(JSON.parse(parsed.data.contextJson));
  return { status: parsed.data.status, items: envelope.items.map(item => ({
    content: item.content, source: item.sourceRef, confirmedAt: item.confirmedAt,
  })) };
}
