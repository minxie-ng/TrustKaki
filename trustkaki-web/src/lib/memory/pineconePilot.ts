import "server-only";
import { z } from "zod";
import { pilotRecords } from "@/lib/agents/evaluation/memoryRetrievalCases";
import { memorySearchHitSchema, type MemorySourceRecord, type RetrievalDependencies } from "./retrievalContracts";

export interface PineconePilotConfig {
  host: string; apiKey: string; namespace: string;
  embeddingEndpoint: string; embeddingApiKey: string; embeddingModel: string; minimumScore: number;
}
const vectorSchema = z.array(z.number().finite()).min(1).max(20000);
function endpoint(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) throw new Error("Invalid memory pilot endpoint");
  return url;
}
export function createPineconePilot(config: PineconePilotConfig, send: typeof fetch = fetch) {
  const host = endpoint(config.host);
  const embedding = endpoint(config.embeddingEndpoint);
  if (!host.hostname.endsWith(".pinecone.io") || host.pathname !== "/"
    || !embedding.pathname.endsWith("/embeddings")
    || !/^trustkaki-fictional-memory-pilot-[a-z0-9-]+$/.test(config.namespace)
    || !config.apiKey.trim() || !config.embeddingApiKey.trim()
    || !config.embeddingModel.trim() || !Number.isFinite(config.minimumScore)) throw new Error("Invalid memory pilot configuration");
  const usage = { embeddingTokens: 0, readUnits: 0, upsertedVectors: 0 };
  async function post(url: string, body: unknown, signal: AbortSignal, pinecone = false): Promise<unknown> {
    try {
      const response = await send(url, { method: "POST", redirect: "error", signal,
        headers: pinecone ? { "Content-Type": "application/json", "Api-Key": config.apiKey, "X-Pinecone-Api-Version": "2026-07" }
          : { "Content-Type": "application/json", Authorization: `Bearer ${config.embeddingApiKey}` },
        body: JSON.stringify(body) });
      if (!response.ok) throw new Error();
      return await response.json();
    } catch { throw new Error("Memory pilot provider request failed"); }
  }
  async function embedBatch(texts: string[], signal: AbortSignal): Promise<number[][]> {
    if (texts.length < 1 || texts.length > 100 || texts.some(t => !t.trim() || [...t].length > 2000)) throw new Error("Invalid embedding input");
    const response = z.object({ model: z.literal(config.embeddingModel),
      data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: vectorSchema })).length(texts.length),
      usage: z.object({ total_tokens: z.number().int().nonnegative() }),
    }).safeParse(await post(embedding.href, { model: config.embeddingModel, input: texts, encoding_format: "float" }, signal));
    if (!response.success) throw new Error("Invalid embedding response");
    const ordered = response.data.data.sort((a, b) => a.index - b.index);
    if (ordered.some((r, i) => r.index !== i || r.embedding.length !== ordered[0].embedding.length)) throw new Error("Invalid embedding response");
    usage.embeddingTokens += response.data.usage.total_tokens;
    return ordered.map(r => r.embedding);
  }
  const search: RetrievalDependencies["search"] = async (args, signal) => {
    if (!Number.isInteger(args.topK) || args.topK < 1 || args.topK > 20) throw new Error("Invalid search limit");
    const response = z.object({ matches: z.array(z.object({ id: z.string(), score: z.number().finite(), metadata: z.record(z.string(), z.unknown()) })).max(20),
      usage: z.object({ readUnits: z.number().nonnegative() }),
    }).safeParse(await post(`${host.origin}/query`, {
      namespace: config.namespace, vector: vectorSchema.parse(args.vector), topK: args.topK,
      includeMetadata: true, includeValues: false,
      filter: { $and: [
        { organisation_id: { $eq: args.scope.organisationId } }, { senior_id: { $eq: args.scope.seniorId } },
        { status: { $eq: "active" } }, { expires_at_ms: { $gt: Date.parse(args.now) } },
        { embedding_model: { $eq: config.embeddingModel } },
      ] },
    }, signal, true));
    if (!response.success) throw new Error("Invalid search response");
    usage.readUnits += response.data.usage.readUnits;
    return response.data.matches.map(m => memorySearchHitSchema.parse({ id: m.id, score: m.score,
      organisationId: m.metadata.organisation_id, seniorId: m.metadata.senior_id,
      sourceVersion: m.metadata.source_version, indexVersion: m.metadata.index_version, embeddingModel: m.metadata.embedding_model,
    }));
  };
  async function upsert(records: MemorySourceRecord[], vectors: number[][], signal: AbortSignal): Promise<void> {
    // Pilot uploads are restricted to the exact generated fixture corpus, never database records.
    const allowed = new Map(pilotRecords.map(r => [r.id, JSON.stringify(r)]));
    if (!records.length || records.length > 100 || records.length !== vectors.length
      || records.some(r => allowed.get(r.id) !== JSON.stringify(r))
      || vectors.some(v => !vectorSchema.safeParse(v).success || v.length !== vectors[0].length)) throw new Error("Invalid fictional pilot upload");
    const response = z.object({ upsertedCount: z.literal(records.length) }).safeParse(await post(`${host.origin}/vectors/upsert`, {
      namespace: config.namespace, vectors: records.map((r, i) => ({ id: r.id, values: vectors[i], metadata: {
        organisation_id: r.organisationId, senior_id: r.seniorId, source_version: r.version, index_version: r.version,
        embedding_model: config.embeddingModel, status: r.status, expires_at_ms: r.expiresAt ? Date.parse(r.expiresAt) : 253402300799999,
      } })),
    }, signal, true));
    if (!response.success) throw new Error("Invalid upsert response");
    usage.upsertedVectors += records.length;
  }
  async function indexState(signal: AbortSignal) {
    const result = z.object({ dimension: z.number().int().positive(),
      namespaces: z.record(z.string(), z.object({ vectorCount: z.number().int().nonnegative() })),
    }).safeParse(await post(`${host.origin}/describe_index_stats`, {}, signal, true));
    if (!result.success) throw new Error("Invalid index stats response");
    return { dimension: result.data.dimension, count: result.data.namespaces[config.namespace]?.vectorCount ?? 0 };
  }
  return { embedBatch, embed: async (query: string, signal: AbortSignal) => (await embedBatch([query], signal))[0], search, upsert, indexState, usage };
}
