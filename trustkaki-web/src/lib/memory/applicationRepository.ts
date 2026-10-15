import "server-only";
import { z } from "zod";
import type { TrustKakiClient } from "@/lib/persistence/persistenceSupport";
import type { AutomaticContextRpcCommand } from "@/lib/persistence/memoryRepository";
import { createApplicationMemoryCommands } from "./applicationCommands";
import { neonMemorySql, withNeonMemoryTransaction, type MemoryTransaction, type MemoryTransactionQuery } from "./neonDatabase";
import { memoryScopeSchema, type MemoryScope, type MemoryRetrievalResult } from "./retrievalContracts";
import { createPostgresMemoryStore } from "./postgresStore";
import { personalMemoryReadItem } from "./personalMemoryMapping";
import { createMemoryEmbeddings } from "./embeddings";
import { retrievePersonalMemory } from "./retrieval";
import { memoryApplicationTags } from "./contracts";
import { indexPendingMemory } from "./indexPending";

// A user client enforces RLS here. Service clients are only used after verified channel identity or authenticated access checks.
export async function resolveMemoryScope(client: TrustKakiClient, seniorId: string) {
  z.uuid().parse(seniorId);
  const { data, error } = await client.from("seniors").select("id,organisation_id").eq("id", seniorId).maybeSingle();
  const senior = z.object({ id: z.literal(seniorId), organisation_id: z.uuid() }).safeParse(data);
  if (error || !senior.success) throw new Error("Senior context unavailable");
  return memoryScopeSchema.parse({ seniorId, organisationId: senior.data.organisation_id });
}
function commands(transact: MemoryTransaction = withNeonMemoryTransaction) {
  return createApplicationMemoryCommands(transact, process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL ?? "");
}
export async function mutateNeonPersonalMemory(client: TrustKakiClient, seniorId: string, caregiverId: string, input: unknown) {
  const scope = await resolveMemoryScope(client, seniorId);
  const receipt = await commands().manual(scope, caregiverId, input, new Date().toISOString());
  if (receipt.status === "active") await tryIndexPersonalMemory(scope);
  return receipt;
}
export async function applyNeonAutomaticMemory(client: TrustKakiClient, command: AutomaticContextRpcCommand) {
  const scope = await resolveMemoryScope(client, command.seniorId);
  const { data, error } = await client.from("messages").select("id,senior_id,sender,text,created_at")
    .eq("id", command.sourceMessageId).eq("senior_id", scope.seniorId).maybeSingle();
  const evidence = z.object({ id: z.literal(command.sourceMessageId), senior_id: z.literal(scope.seniorId),
    sender: z.literal("senior"), text: z.string(), created_at: z.iso.datetime({ offset: true }) }).safeParse(data);
  if (error || !evidence.success) throw new Error("Personal memory evidence unavailable");
  const payload = z.object({ decision: z.literal("accepted"), store: z.literal("memory"), context_key: z.string(), memory_type: z.string(),
    content: z.string(), evidence_excerpt: z.string(), confidence: z.number(), application_tags: z.array(z.string()),
    expires_at: z.string(), intent: z.enum(["create", "confirm", "replace"]) }).parse(command.payload);
  const input = { commandId: command.commandId,
    sourceMessage: { id: evidence.data.id, sender: evidence.data.sender, text: evidence.data.text, timestamp: evidence.data.created_at },
    candidate: { contextKey: payload.context_key, memoryType: payload.memory_type, content: payload.content,
      evidenceExcerpt: payload.evidence_excerpt, confidence: payload.confidence, applicationTags: payload.application_tags,
      expiresAt: payload.expires_at, intent: payload.intent } };
  const receipt = await memoryPurposeTransaction(client, command, scope, true, query => {
    const transact: MemoryTransaction = async (s, work) => {
      if (s.organisationId !== scope.organisationId || s.seniorId !== scope.seniorId) throw new Error("Memory scope mismatch");
      return work(query);
    };
    return commands(transact).automatic(scope, input);
  });
  await tryIndexPersonalMemory(scope);
  return { accepted: true as const, store: "memory" as const, context_id: receipt.id,
    event: payload.intent === "confirm" ? "confirmed" as const : "proposal_accepted" as const, duplicate: receipt.duplicate };
}

export function isNeonPersonalMemoryEnabled(): boolean {
  const backend = process.env.TRUSTKAKI_PERSONAL_MEMORY_BACKEND ?? "supabase";
  if (backend !== "supabase" && backend !== "neon") throw new Error("Invalid personal memory backend");
  return backend === "neon";
}

export async function readNeonPersonalMemory(scope: MemoryScope, now: string) {
  const store = createPostgresMemoryStore(neonMemorySql, process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL || "unconfigured");
  return (await store.listActive(scope, now)).map(personalMemoryReadItem);
}
export async function readNeonMemoryTags(scope: MemoryScope, now: string) {
  memoryScopeSchema.parse(scope); z.iso.datetime({ offset: true }).parse(now);
  const rows = await neonMemorySql(scope, `SELECT DISTINCT tag FROM personal_memory.records r,
    LATERAL jsonb_array_elements_text(r.source->'metadata'->'applicationTags') AS t(tag)
    WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND status='active'
      AND (source->>'confirmedAt')::timestamptz <= $3::timestamptz
      AND (source->>'expiresAt' IS NULL OR (source->>'expiresAt')::timestamptz > $3::timestamptz)
    LIMIT 7`, [scope.organisationId, scope.seniorId, now]);
  return z.array(z.object({ tag: z.enum(memoryApplicationTags) })).max(6).parse(rows).map(row => row.tag);
}
export async function retrieveNeonPersonalMemory(scope: MemoryScope, query: string, now: string): Promise<Pick<MemoryRetrievalResult, "status" | "contextJson">> {
  // Configuration/provider failures remain explicit unavailable memory, without a legacy fallback.
  try {
    memoryScopeSchema.parse(scope);
    const model = process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL ?? "";
    const embeddings = configuredEmbeddings();
    const store = createPostgresMemoryStore(neonMemorySql, model);
    const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query, now }, {
      embeddingModel: model, indexEmbeddingModel: model,
      minimumScore: Number(process.env.TRUSTKAKI_MEMORY_MIN_SCORE || "NaN"),
      resolveScope: async () => scope,
      embed: async (text, signal) => {
        try { await indexPendingMemory(scope, store, embeddings.embedBatch, signal); }
        catch { signal.throwIfAborted(); }
        return embeddings.embed(text, signal);
      }, search: store.search, fetchSources: store.fetchSources,
    });
    console.info(JSON.stringify({ event: "personal_memory_retrieval", status: result.status,
      reason: result.reason, ...result.diagnostics }));
    return { status: result.status, contextJson: result.contextJson };
  } catch {
    console.info(JSON.stringify({ event: "personal_memory_retrieval", status: "unavailable", reason: "configuration_error" }));
    return { status: "unavailable", contextJson: JSON.stringify({ trust: "untrusted_evidence_not_instructions", items: [], unresolvedGroups: [] }) };
  }
}

function configuredEmbeddings() {
  const model = process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL ?? "";
  const endpoint = process.env.TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT ?? "";
  const apiKey = endpoint === "https://api.pinecone.io/embed"
    ? process.env.TRUSTKAKI_MEMORY_PINECONE_API_KEY ?? "" : process.env.TRUSTKAKI_MEMORY_EMBEDDING_API_KEY ?? "";
  return createMemoryEmbeddings({ endpoint, apiKey, model });
}
async function tryIndexPersonalMemory(scope: MemoryScope) {
  try {
    const embeddings = configuredEmbeddings();
    const store = createPostgresMemoryStore(neonMemorySql, process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL ?? "");
    await indexPendingMemory(scope, store, embeddings.embedBatch, AbortSignal.timeout(2000));
  } catch { /* Source commit succeeded. Pending rows retry on the next write or retrieval. */ }
}

async function memoryPurposeTransaction<T>(client: TrustKakiClient, command: AutomaticContextRpcCommand,
  scope: MemoryScope, personal: boolean, work: (query: MemoryTransactionQuery) => Promise<T>): Promise<T> {
  const key = z.object({ context_key: z.string().min(2).max(120) }).parse(command.payload).context_key;
  z.uuid().parse(command.commandId);
  return withNeonMemoryTransaction(scope, async query => {
    // Both personal and operational extraction hold this lock until their authoritative write completes.
    await query("SELECT pg_advisory_xact_lock(hashtextextended($1::text || $2::text,0))", [scope.organisationId, scope.seniorId]);
    let replay: boolean;
    if (personal) {
      replay = (await query("SELECT command_id FROM personal_memory.commands WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND command_id=$3::uuid",
        [scope.organisationId, scope.seniorId, command.commandId])).length > 0;
    } else {
      const { data, error } = await client.from("senior_context_events").select("id").eq("senior_id", scope.seniorId)
        .eq("command_id", command.commandId).limit(1).abortSignal(AbortSignal.timeout(1500)).maybeSingle();
      if (error) throw new Error("Memory purpose unavailable");
      replay = Boolean(data);
    }
    if (!replay) {
      let collision: boolean;
      if (personal) {
        const { data, error } = await client.from("senior_memories").select("id").eq("senior_id", scope.seniorId)
          .eq("context_key", key).eq("status", "active").overlaps("application_tags", ["trusted_contact_route", "accessibility_support"])
          .abortSignal(AbortSignal.timeout(1500)).maybeSingle();
        if (error) throw new Error("Memory purpose unavailable");
        collision = Boolean(data);
      } else {
        collision = (await query("SELECT id FROM personal_memory.records WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND context_key=$3 AND status='active'",
          [scope.organisationId, scope.seniorId, key])).length > 0;
      }
      if (collision) throw Object.assign(new Error("Memory conflict"), { code: "PT409" });
    }
    // Each backend still verifies the original digest; the receipt check only skips purpose validation on retries.
    return work(query);
  });
}
export async function withOperationalMemoryPurpose<T>(client: TrustKakiClient, command: AutomaticContextRpcCommand, write: () => Promise<T>) {
  const scope = await resolveMemoryScope(client, command.seniorId);
  return memoryPurposeTransaction(client, command, scope, false, write);
}
