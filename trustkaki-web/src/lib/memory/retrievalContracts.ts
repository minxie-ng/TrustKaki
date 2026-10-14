import { z } from "zod";

const shortText = z.string().trim().min(1).max(160);
const instant = z.iso.datetime({ offset: true });
export const memoryScopeSchema = z.object({ organisationId: z.uuid(), seniorId: z.uuid() });
export type MemoryScope = z.infer<typeof memoryScopeSchema>;
export const memorySourceRecordSchema = memoryScopeSchema.extend({
  id: shortText, contextKey: shortText, content: z.string().trim().min(1).max(2000),
  sourceRef: shortText, evidenceExcerpt: z.string().trim().min(1).max(2000),
  confirmedAt: instant, expiresAt: instant.nullable(),
  status: z.enum(["active", "superseded", "deleted"]), version: z.number().int().positive(),
  conflictGroup: shortText.nullable(), unresolvedConflict: z.boolean(),
  safeUseNotes: z.string().max(280).nullable(),
}).refine(r => !r.unresolvedConflict || r.conflictGroup !== null);
export type MemorySourceRecord = z.infer<typeof memorySourceRecordSchema>;
export const memorySearchHitSchema = memoryScopeSchema.extend({
  id: shortText, sourceVersion: z.number().int().positive(), indexVersion: z.number().int().positive(),
  embeddingModel: shortText, score: z.number().finite(),
});
export type MemorySearchHit = z.infer<typeof memorySearchHitSchema>;
export interface RetrievalDependencies {
  embeddingModel: string;
  indexEmbeddingModel: string;
  minimumScore: number;
  // Resolve from server-side auth or verified channel identity, never client metadata.
  resolveScope(seniorId: string, signal: AbortSignal): Promise<MemoryScope | null>;
  embed(query: string, signal: AbortSignal): Promise<unknown>;
  search(args: { scope: MemoryScope; vector: number[]; topK: number; now: string }, signal: AbortSignal): Promise<unknown>;
  // Return current records, including unresolvedConflict even when its companion was not a search hit.
  fetchSources(scope: MemoryScope, ids: string[], signal: AbortSignal): Promise<unknown>;
}
export type RetrievedMemory = Pick<MemorySourceRecord,
  "id" | "contextKey" | "content" | "sourceRef" | "evidenceExcerpt" | "version" | "confirmedAt" | "safeUseNotes">;
export type RetrievalFailure = "invalid_input" | "access_denied" | "embedding_mismatch" | "malformed_result" | "provider_error" | "timeout";
export interface MemoryRetrievalResult {
  status: "available" | "empty" | "unavailable";
  reason: RetrievalFailure | null;
  items: RetrievedMemory[];
  unresolvedGroups: string[];
  contextJson: string;
  diagnostics: { unresolvedGroupCount: number; candidates: number; selected: number; elapsedMs: number };
}
