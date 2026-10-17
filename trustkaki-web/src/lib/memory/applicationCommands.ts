import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { seniorContextActionRequestSchema } from "@/lib/api/schemas";
import { memoryApplicationTags } from "./contracts";
import { evaluateMemoryCandidate } from "./policy";
import type { MemoryTransaction, MemoryTransactionQuery } from "./neonDatabase";
import { memoryScopeSchema, memorySourceRecordSchema, type MemoryScope, type MemorySourceRecord } from "./retrievalContracts";

const instant = z.iso.datetime({ offset: true });
const automaticSchema = z.object({
  commandId: z.uuid(),
  sourceMessage: z.object({ id: z.uuid(), sender: z.literal("senior"), text: z.string().min(1).max(5000), timestamp: instant }).strict(),
  candidate: z.object({
    contextKey: z.string().trim().min(2).max(120).regex(/^[a-z0-9_:-]+$/),
    memoryType: z.enum(["communication_preference", "food_preference", "routine_preference", "aac_preference"]),
    content: z.string().trim().min(1).max(500), evidenceExcerpt: z.string().min(8).max(500),
    confidence: z.number().min(0).max(1), applicationTags: z.array(z.enum(memoryApplicationTags)).max(6),
    expiresAt: instant, intent: z.enum(["create", "confirm", "replace"]),
  }).strict(),
}).strict();
const receiptSchema = z.object({ id: z.uuid(), version: z.number().int().positive(), status: z.enum(["active", "superseded", "deleted"]) });
const conflict = (reason: "request_digest_changed" | "inactive_target" | "create_target_exists" | "update_target_missing" | "confirmation_changed" | "stale_evidence" | "manual_target_changed" = "manual_target_changed"): never => {
  console.info(JSON.stringify({ event: "personal_memory_conflict", reason }));
  throw Object.assign(new Error("Memory conflict"), { code: "PT409" });
};
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => [key, canonical(item)]));
  return value;
}
function personalTags(tags: string[]) {
  if (tags.some(tag => tag === "trusted_contact_route" || tag === "accessibility_support")) throw new Error("Operational context must stay in Supabase");
}

// Scope, caregiver identity and senior-authored evidence must be resolved by trusted server callers.
// Hash the original request, never a source/version rebuilt from mutable state on retry.
export function createApplicationMemoryCommands(transact: MemoryTransaction, embeddingModel: string) {
  z.string().trim().min(1).max(160).parse(embeddingModel);
  async function command(
    scope: MemoryScope, commandId: string, request: unknown,
    prepare: (query: MemoryTransactionQuery) => Promise<{
      id: string; expectedVersion: number; action: "put" | "archive"; source?: MemorySourceRecord; actor: string; reason: string;
    }>,
  ) {
    memoryScopeSchema.parse(scope);
    const digest = createHash("sha256").update(JSON.stringify(canonical({ scope, request, embeddingModel }))).digest("hex");
    return transact(scope, async query => {
      await query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || $2::text,0))", [scope.organisationId, scope.seniorId]);
      const receipts = z.array(z.object({ digest: z.string(), result: receiptSchema })).max(1).parse(await query(
        "SELECT digest,result FROM personal_memory.commands WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND command_id=$3::uuid",
        [scope.organisationId, scope.seniorId, commandId]));
      if (receipts.length) {
        if (receipts[0].digest !== digest) conflict("request_digest_changed");
        return { ...receipts[0].result, duplicate: true };
      }
      const c = await prepare(query);
      const source = c.source ? memorySourceRecordSchema.parse(c.source) : null;
      const rows = z.array(z.object({ result: receiptSchema })).length(1).parse(await query(
        "SELECT personal_memory.apply_command($1::uuid,$2,$3::integer,$4,$5::jsonb,$6,$7,$8,$9) AS result",
        [commandId, c.id, c.expectedVersion, c.action, source ? JSON.stringify(source) : null, digest, c.actor, c.reason, embeddingModel]).catch(error => {
          if (error && typeof error === "object" && "code" in error && error.code === "PT409") {
            console.info(JSON.stringify({ event: "personal_memory_conflict", reason: "database_command" }));
          }
          throw error;
        }));
      return { ...rows[0].result, duplicate: false };
    });
  }
  async function current(query: MemoryTransactionQuery, scope: MemoryScope, field: "id" | "context_key", value: string) {
    const rows = z.array(z.object({ source: memorySourceRecordSchema.nullable(), status: z.string() })).max(1).parse(await query(
      `SELECT source,status FROM personal_memory.records WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND ${field}=$3 FOR UPDATE`,
      [scope.organisationId, scope.seniorId, value]));
    if (!rows.length) return null;
    const source = rows[0].source;
    if (rows[0].status !== "active" || !source?.metadata) return conflict("inactive_target");
    return source as MemorySourceRecord & { metadata: NonNullable<MemorySourceRecord["metadata"]> };
  }
  async function automatic(scope: MemoryScope, input: unknown) {
    const request = automaticSchema.parse(input);
    const c = request.candidate;
    personalTags(c.applicationTags);
    const eligibility = evaluateMemoryCandidate({ targetStore: "memory", contextKey: c.contextKey, contextType: c.memoryType,
      content: c.content, sourceMessageId: request.sourceMessage.id, evidenceExcerpt: c.evidenceExcerpt,
      confidence: c.confidence, applicationTags: c.applicationTags, retentionClass: "preference",
      ...(c.intent === "create" ? {} : { intent: c.intent }) }, request.sourceMessage);
    if (!eligibility.accepted || Date.parse(c.expiresAt) <= Date.parse(request.sourceMessage.timestamp)
      || Date.parse(c.expiresAt) - Date.parse(request.sourceMessage.timestamp) > 180 * 86400000) throw new Error("Invalid personal memory proposal");
    return command(scope, request.commandId, { type: "automatic", ...request }, async query => {
      const previous = await current(query, scope, "context_key", c.contextKey);
      if (c.intent === "create" && previous) conflict("create_target_exists");
      if (c.intent !== "create" && !previous) conflict("update_target_missing");
      if (c.intent === "confirm" && c.content !== previous?.content) conflict("confirmation_changed");
      const at = request.sourceMessage.timestamp;
      if (previous && Date.parse(at) < Date.parse(previous.metadata.updatedAt)) conflict("stale_evidence");
      const id = previous?.id ?? randomUUID();
      const version = (previous?.version ?? 0) + 1;
      const source: MemorySourceRecord = { ...scope, id, contextKey: c.contextKey,
        content: c.intent === "confirm" ? previous!.content : eligibility.candidate.content,
        sourceRef: `message:${request.sourceMessage.id}`, evidenceExcerpt: c.evidenceExcerpt,
        confirmedAt: at, expiresAt: c.expiresAt, status: "active", version,
        conflictGroup: null, unresolvedConflict: false, safeUseNotes: previous?.safeUseNotes ?? null,
        metadata: { memoryType: c.memoryType, confidence: c.confidence, importance: previous?.metadata.importance ?? 3,
          applicationTags: c.applicationTags, extractionMethod: "ai_extracted", provenanceStatus: "verified_excerpt",
          sourceMessageId: request.sourceMessage.id, sourceLabel: "context_memory",
          rememberedAt: previous?.metadata.rememberedAt ?? at, followUpAfter: previous?.metadata.followUpAfter ?? null,
          createdByCaregiverId: previous?.metadata.createdByCaregiverId ?? null, createdBySystem: previous ? previous.metadata.createdBySystem : "context_memory",
          updatedByCaregiverId: null, updatedBySystem: "context_memory", createdAt: previous?.metadata.createdAt ?? at,
          updatedAt: at, legacyStatus: null, supersededById: null },
      };
      return { id, expectedVersion: version - 1, action: "put", source, actor: "system:context_memory", reason: `Accepted ${c.intent} proposal` };
    });
  }
  async function manual(scope: MemoryScope, caregiverId: string, input: unknown, now: string) {
    z.uuid().parse(caregiverId); instant.parse(now);
    const request = seniorContextActionRequestSchema.parse(input);
    if (request.store !== "memory") throw new Error("Invalid personal memory command");
    if (request.action === "correct") personalTags(request.replacement.applicationTags);
    return command(scope, request.commandId, { type: "manual", caregiverId, ...request }, async query => {
      const previous = await current(query, scope, "id", request.contextId);
      if (!previous || Date.parse(previous.metadata.updatedAt) !== Date.parse(request.expectedUpdatedAt)
        || Date.parse(now) < Date.parse(previous.metadata.updatedAt)) return conflict();
      const common = { id: previous.id, expectedVersion: previous.version, actor: `caregiver:${caregiverId}`, reason: request.reason };
      if (request.action === "archive") return { ...common, action: "archive" };
      // Context keys are stable identities in the canonical store.
      if (request.replacement.contextKey !== previous.contextKey) return conflict();
      const replacement = request.replacement;
      return { ...common, action: "put", source: { ...previous, content: replacement.content,
        confirmedAt: now, expiresAt: replacement.expiresAt, version: previous.version + 1,
        sourceRef: `caregiver:${caregiverId}`, evidenceExcerpt: replacement.content,
        conflictGroup: null, unresolvedConflict: false, safeUseNotes: replacement.safeUseNotes,
        metadata: { ...previous.metadata, memoryType: replacement.memoryType, importance: replacement.importance,
          applicationTags: replacement.applicationTags, extractionMethod: "admin_corrected", provenanceStatus: "manual_confirmation",
          sourceMessageId: null, sourceLabel: "caregiver correction", confidence: 1,
          updatedByCaregiverId: caregiverId, updatedBySystem: null, updatedAt: now, legacyStatus: null, supersededById: null } } };
    });
  }
  return { automatic, manual };
}
