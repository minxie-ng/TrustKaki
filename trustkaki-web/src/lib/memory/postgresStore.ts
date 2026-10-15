import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { memoryScopeSchema, memorySourceRecordSchema, memorySearchHitSchema, type MemoryScope, type RetrievalDependencies } from "./retrievalContracts";

export type ScopedMemorySql = (scope: MemoryScope, text: string, values: unknown[], signal?: AbortSignal) => Promise<unknown[]>;
const idSchema = z.string().trim().min(1).max(160);
const receiptSchema = z.object({ id: idSchema, version: z.number().int().positive(), status: z.enum(["active", "superseded", "deleted"]) });
const commandSchema = z.object({
  commandId: z.uuid(), id: idSchema, expectedVersion: z.number().int().min(0).max(2147483646),
  action: z.enum(["put", "archive", "erase"]), source: memorySourceRecordSchema.optional(),
  actor: idSchema, reason: z.string().trim().min(1).max(280),
});
export type PersonalMemoryCommand = z.infer<typeof commandSchema>;
function vectorText(vector: number[]): string {
  z.array(z.number().finite()).length(1024).parse(vector);
  if (!vector.some(n => n !== 0)) throw new Error("Invalid memory vector");
  return JSON.stringify(vector);
}
export function createPostgresMemoryStore(execute: ScopedMemorySql, embeddingModel: string) {
  idSchema.parse(embeddingModel);
  async function run(scope: MemoryScope, text: string, values: unknown[], signal?: AbortSignal) {
    memoryScopeSchema.parse(scope); signal?.throwIfAborted();
    try { return await execute(scope, text, values, signal); }
    catch (error) {
      if (error && typeof error === "object" && "code" in error && ["PT409", "23505"].includes(String(error.code))) throw new Error("Memory conflict");
      throw new Error("Personal memory unavailable");
    }
  }
  async function apply(scope: MemoryScope, input: PersonalMemoryCommand) {
    memoryScopeSchema.parse(scope);
    const c = commandSchema.parse(input);
    if (c.action === "put") {
      if (!c.source || c.source.id !== c.id || c.source.organisationId !== scope.organisationId || c.source.seniorId !== scope.seniorId
        || c.source.version !== c.expectedVersion + 1 || c.source.status !== "active") throw new Error("Invalid memory source");
    } else if (c.source) throw new Error("Unexpected memory source");
    const digest = createHash("sha256").update(JSON.stringify({ ...c, embeddingModel })).digest("hex");
    const rows = await run(scope, "SELECT personal_memory.apply_command($1::uuid,$2,$3::integer,$4,$5::jsonb,$6,$7,$8,$9) AS result",
      [c.commandId, c.id, c.expectedVersion, c.action, c.source ? JSON.stringify(c.source) : null, digest, c.actor, c.reason, embeddingModel]);
    return z.array(z.object({ result: receiptSchema })).length(1).parse(rows)[0].result;
  }
  async function fetchSources(scope: MemoryScope, ids: string[], signal?: AbortSignal) {
    z.array(idSchema).max(20).parse(ids);
    if (!ids.length) return [];
    const rows = await run(scope, `SELECT source FROM personal_memory.records
      WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND id=ANY($3::text[]) AND source IS NOT NULL`,
    [scope.organisationId, scope.seniorId, ids], signal);
    return z.array(z.object({ source: memorySourceRecordSchema })).max(20).parse(rows).map(r => r.source);
  }
  const search = async (args: Parameters<RetrievalDependencies["search"]>[0], signal?: AbortSignal) => {
    z.number().int().min(1).max(20).parse(args.topK);
    z.iso.datetime({ offset: true }).parse(args.now);
    const vector = vectorText(args.vector);
    const rows = await run(args.scope, `SELECT id, organisation_id AS "organisationId", senior_id AS "seniorId",
      version AS "sourceVersion", index_version AS "indexVersion", embedding_model AS "embeddingModel",
      1 - (embedding <=> $3::vector) AS score FROM personal_memory.records
      WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND status='active'
        AND embedding IS NOT NULL AND index_version=version AND embedding_model=$4
        AND source->'metadata'->>'provenanceStatus' IS DISTINCT FROM 'missing_source'
        AND (source->>'confirmedAt')::timestamptz <= $5::timestamptz
        AND (source->>'expiresAt' IS NULL OR (source->>'expiresAt')::timestamptz > $5::timestamptz)
      ORDER BY embedding <=> $3::vector, id LIMIT $6`,
    [args.scope.organisationId, args.scope.seniorId, vector, embeddingModel, args.now, args.topK], signal);
    return z.array(memorySearchHitSchema).max(20).parse(rows);
  };
  async function publishEmbedding(scope: MemoryScope, id: string, version: number, vector: number[]) {
    idSchema.parse(id); z.number().int().positive().parse(version);
    const encoded = vectorText(vector);
    const rows = await run(scope, `UPDATE personal_memory.records SET embedding=$5::vector, index_version=version
      WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND id=$3 AND version=$4
        AND status='active' AND embedding_model=$6 AND embedding IS NULL RETURNING id`,
    [scope.organisationId, scope.seniorId, id, version, encoded, embeddingModel]);
    return z.array(z.object({ id: idSchema })).max(1).parse(rows).length === 1;
  }
  async function pending(scope: MemoryScope, limit: number) {
    z.number().int().min(1).max(20).parse(limit);
    const rows = await run(scope, `SELECT source FROM personal_memory.records
      WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND status='active'
        AND embedding IS NULL AND embedding_model=$3
        AND source->'metadata'->>'provenanceStatus' IS DISTINCT FROM 'missing_source'
      ORDER BY updated_at, id LIMIT $4`, [scope.organisationId, scope.seniorId, embeddingModel, limit]);
    return z.array(z.object({ source: memorySourceRecordSchema })).max(20).parse(rows).map(r => r.source);
  }
  return { apply, fetchSources, search, publishEmbedding, pending };
}
