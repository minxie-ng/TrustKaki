import { z } from "zod";
import type { Database } from "@/lib/supabase/types";
import type { SeniorContextReadItem } from "@/lib/api/schemas";
import { memoryScopeSchema, memorySourceRecordSchema, type MemoryScope, type MemorySourceRecord } from "./retrievalContracts";

type LegacyMemory = Database["public"]["Tables"]["senior_memories"]["Row"];
export function classifyMemoryPurpose(row: Pick<LegacyMemory, "memory_type" | "application_tags">): "personal" | "operational" | "review_required" {
  if (row.application_tags.some(tag => tag === "trusted_contact_route" || tag === "accessibility_support")) return "operational";
  if (row.memory_type === "family_context" || row.memory_type === "other") return "review_required";
  return "personal";
}

// Mapping only: callers must resolve scope and fetch provenance from trusted storage.
export function mapLegacyPersonalMemory(args: {
  scope: MemoryScope; row: LegacyMemory; reviewedPurpose?: "personal" | "operational";
  evidence?: { messageId: string; text: string; excerpt: string };
}): MemorySourceRecord {
  const scope = memoryScopeSchema.parse(args.scope);
  const row = args.row;
  z.uuid().parse(row.id);
  if (row.senior_id !== scope.seniorId) throw new Error("Memory scope mismatch");
  const purpose = classifyMemoryPurpose(row);
  if (purpose === "operational" || args.reviewedPurpose === "operational"
    || (purpose === "review_required" && args.reviewedPurpose !== "personal")) throw new Error("Memory purpose requires review");
  const evidence = args.evidence;
  if (evidence && (!row.source_message_id || evidence.messageId !== row.source_message_id
    || !evidence.excerpt.trim() || !evidence.text.includes(evidence.excerpt.trim()))) throw new Error("Memory evidence mismatch");
  return memorySourceRecordSchema.parse({
    ...scope, id: row.id, contextKey: row.context_key, content: row.content,
    sourceRef: evidence ? `message:${evidence.messageId}` : `missing:legacy:${row.id}`,
    evidenceExcerpt: evidence?.excerpt.trim() ?? "", confirmedAt: row.last_confirmed_at,
    expiresAt: row.expires_at, status: row.status === "active" ? "active" : "superseded",
    version: 1, conflictGroup: null, unresolvedConflict: false, safeUseNotes: row.safe_use_notes,
    metadata: { memoryType: row.memory_type, confidence: row.confidence, importance: row.importance,
      applicationTags: row.application_tags, extractionMethod: row.extraction_method,
      provenanceStatus: evidence ? "verified_excerpt" : "missing_source", sourceMessageId: row.source_message_id,
      sourceLabel: row.source, rememberedAt: row.remembered_at, followUpAfter: row.follow_up_after,
      createdByCaregiverId: row.created_by_caregiver_id, createdBySystem: row.created_by_system,
      updatedByCaregiverId: row.updated_by_caregiver_id, updatedBySystem: row.updated_by_system,
      createdAt: row.created_at, updatedAt: row.updated_at, legacyStatus: row.status, supersededById: row.superseded_by_id },
  });
}

export function personalMemoryReadItem(input: MemorySourceRecord): Extract<SeniorContextReadItem, { store: "memory" }> {
  const source = memorySourceRecordSchema.parse(input);
  const metadata = source.metadata;
  if (!metadata) throw new Error("Personal memory metadata unavailable");
  return { id: source.id, store: "memory", contextKey: source.contextKey, memoryType: metadata.memoryType,
    content: source.content, importance: metadata.importance, safeUseNotes: source.safeUseNotes,
    applicationTags: metadata.applicationTags, source: metadata.extractionMethod,
    lastConfirmedAt: source.confirmedAt, expiresAt: source.expiresAt, updatedAt: metadata.updatedAt };
}
