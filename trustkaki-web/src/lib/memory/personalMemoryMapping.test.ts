import { expect, it } from "vitest";
import { classifyMemoryPurpose, mapLegacyPersonalMemory, personalMemoryReadItem } from "./personalMemoryMapping";
import { memorySourceRecordSchema } from "./retrievalContracts";
import type { Database } from "@/lib/supabase/types";
import { retrievalEvaluationScope as scope } from "@/lib/agents/evaluation/memoryRetrievalCases";
const row: Database["public"]["Tables"]["senior_memories"]["Row"] = {
  id: "00000000-0000-4000-8000-000000000030", senior_id: scope.seniorId,
  memory_type: "food_preference", content: "I prefer porridge", source: "chat", source_message_id: "00000000-0000-4000-8000-000000000031",
  confidence: 0.93, importance: 4, status: "active", remembered_at: "2026-07-01T00:00:00Z", follow_up_after: null,
  expires_at: null, safe_use_notes: "n".repeat(500), context_key: "breakfast", extraction_method: "ai_extracted",
  last_confirmed_at: "2026-07-02T00:00:00Z", superseded_by_id: null, application_tags: ["practical_meal_prompt"],
  created_by_caregiver_id: null, created_by_system: "context_memory", updated_by_caregiver_id: null, updated_by_system: "context_memory",
  created_at: "2026-07-01T00:00:00Z", updated_at: "2026-07-02T00:00:00Z",
};
const evidence = { messageId: row.source_message_id!, text: "Today I prefer porridge for breakfast", excerpt: "I prefer porridge" };
it("preserves editable fields, attribution, timestamps, and verified evidence", () => {
  const source = mapLegacyPersonalMemory({ scope, row, evidence });
  expect(memorySourceRecordSchema.parse(source)).toEqual(source);
  expect(source).toMatchObject({ ...scope, id: row.id, contextKey: row.context_key, content: row.content, evidenceExcerpt: evidence.excerpt,
    sourceRef: `message:${row.source_message_id}`, safeUseNotes: row.safe_use_notes, version: 1,
    metadata: { memoryType: row.memory_type, confidence: row.confidence, importance: row.importance,
      applicationTags: row.application_tags, extractionMethod: row.extraction_method, provenanceStatus: "verified_excerpt",
      sourceMessageId: row.source_message_id, sourceLabel: row.source, rememberedAt: row.remembered_at,
      followUpAfter: null, createdAt: row.created_at, updatedAt: row.updated_at, legacyStatus: row.status,
      createdBySystem: row.created_by_system, updatedBySystem: row.updated_by_system } });
  expect(personalMemoryReadItem(source)).toEqual({ id: row.id, store: "memory", contextKey: row.context_key, memoryType: row.memory_type,
    content: row.content, importance: row.importance, safeUseNotes: row.safe_use_notes, applicationTags: row.application_tags,
    source: row.extraction_method, lastConfirmedAt: row.last_confirmed_at, expiresAt: null, updatedAt: row.updated_at });
});
it("marks missing evidence explicitly without inventing a quote", () => {
  const source = mapLegacyPersonalMemory({ scope, row });
  expect(source.evidenceExcerpt).toBe("");
  expect(source.metadata?.provenanceStatus).toBe("missing_source");
  expect(memorySourceRecordSchema.safeParse({ ...source, metadata: undefined }).success).toBe(false);
});
it("rejects foreign scope, mismatched message and unsupported excerpts", () => {
  expect(() => mapLegacyPersonalMemory({ scope: { ...scope, seniorId: crypto.randomUUID() }, row, evidence })).toThrow();
  expect(() => mapLegacyPersonalMemory({ scope, row, evidence: { ...evidence, messageId: crypto.randomUUID() } })).toThrow();
  expect(() => mapLegacyPersonalMemory({ scope, row, evidence: { ...evidence, excerpt: "Made up" } })).toThrow();
});
it("blocks ambiguous migration and retains operational routing/accessibility", () => {
  expect(classifyMemoryPurpose(row)).toBe("personal");
  expect(classifyMemoryPurpose({ ...row, memory_type: "family_context" })).toBe("review_required");
  expect(classifyMemoryPurpose({ ...row, memory_type: "other" })).toBe("review_required");
  expect(classifyMemoryPurpose({ ...row, application_tags: ["trusted_contact_route"] })).toBe("operational");
  expect(classifyMemoryPurpose({ ...row, application_tags: ["accessibility_support"] })).toBe("operational");
  expect(() => mapLegacyPersonalMemory({ scope, row: { ...row, memory_type: "family_context" } })).toThrow();
  expect(mapLegacyPersonalMemory({ scope, row: { ...row, memory_type: "family_context" }, reviewedPurpose: "personal" }).metadata?.memoryType).toBe("family_context");
  expect(() => mapLegacyPersonalMemory({ scope, row: { ...row, application_tags: ["trusted_contact_route"] }, reviewedPurpose: "personal" })).toThrow();
});
it("retains archival lineage and rejects malformed metadata", () => {
  const source = mapLegacyPersonalMemory({ scope, row: { ...row, status: "archived", superseded_by_id: crypto.randomUUID() } });
  expect(source.status).toBe("superseded");
  expect(source.metadata?.legacyStatus).toBe("archived");
  expect(memorySourceRecordSchema.safeParse({ ...source, metadata: { ...source.metadata, confidence: 2 } }).success).toBe(false);
});
