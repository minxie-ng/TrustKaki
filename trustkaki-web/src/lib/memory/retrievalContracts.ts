import { z } from "zod";
import { memoryApplicationTags } from "./contracts";

const shortText = z.string().trim().min(1).max(160);
const instant = z.iso.datetime({ offset: true });
export const memoryScopeSchema = z.object({ organisationId: z.uuid(), seniorId: z.uuid() });
export type MemoryScope = z.infer<typeof memoryScopeSchema>;
export const personalMemoryMetadataSchema = z.object({
  memoryType: z.enum(["communication_preference", "family_context", "food_preference", "routine_preference", "aac_preference", "other"]),
  confidence: z.number().min(0).max(1), importance: z.number().int().min(1).max(5),
  applicationTags: z.array(z.enum(memoryApplicationTags)).max(memoryApplicationTags.length)
    .refine(tags => new Set(tags).size === tags.length),
  extractionMethod: z.enum(["caregiver_confirmed", "ai_extracted", "imported", "admin_corrected"]),
  provenanceStatus: z.enum(["verified_excerpt", "manual_confirmation", "missing_source"]),
  sourceMessageId: z.uuid().nullable(), sourceLabel: z.string().max(2000),
  rememberedAt: instant, followUpAfter: instant.nullable(),
  createdByCaregiverId: z.uuid().nullable(), createdBySystem: shortText.nullable(),
  updatedByCaregiverId: z.uuid().nullable(), updatedBySystem: shortText.nullable(),
  createdAt: instant, updatedAt: instant,
  legacyStatus: z.enum(["active", "superseded", "archived"]).nullable(),
  supersededById: z.uuid().nullable(),
});
export const memorySourceRecordSchema = memoryScopeSchema.extend({
  id: shortText, contextKey: shortText, content: z.string().trim().min(1).max(2000),
  sourceRef: shortText, evidenceExcerpt: z.string().trim().max(2000),
  confirmedAt: instant, expiresAt: instant.nullable(),
  status: z.enum(["active", "superseded", "deleted"]), version: z.number().int().positive(),
  conflictGroup: shortText.nullable(), unresolvedConflict: z.boolean(),
  safeUseNotes: z.string().max(500).nullable(),
  metadata: personalMemoryMetadataSchema.optional(),
}).refine(r => !r.unresolvedConflict || r.conflictGroup !== null)
  .refine(r => r.metadata?.provenanceStatus === "missing_source" ? r.evidenceExcerpt === "" : r.evidenceExcerpt.length > 0)
  .refine(r => r.metadata?.provenanceStatus !== "verified_excerpt" || r.metadata.sourceMessageId !== null);
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
