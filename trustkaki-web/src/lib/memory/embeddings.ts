import "server-only";
import { z } from "zod";

export function createMemoryEmbeddings(config: { endpoint: string; apiKey: string; model: string }, send: typeof fetch = fetch) {
  const url = new URL(config.endpoint);
  const native = url.href === "https://api.pinecone.io/embed";
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash
    || (!native && !url.pathname.endsWith("/embeddings")) || !config.apiKey.trim() || !config.model.trim()) {
    throw new Error("Invalid embedding configuration");
  }
  const vector = z.array(z.number().finite()).length(1024).refine(v => v.some(n => n !== 0));
  const usage = { embeddingTokens: 0 };
  async function embedBatch(texts: string[], signal: AbortSignal, inputType: "passage" | "query" = "passage") {
    if (!texts.length || texts.length > 96 || texts.some(t => !t.trim() || [...t].length > 2000)) throw new Error("Invalid embedding input");
    let body: unknown;
    try {
      const response = await send(url.href, { method: "POST", redirect: "error", signal,
        headers: native ? { "Content-Type": "application/json", "Api-Key": config.apiKey, "X-Pinecone-Api-Version": "2026-07" }
          : { "Content-Type": "application/json", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify(native ? { model: config.model, inputs: texts.map(text => ({ text })),
          parameters: { input_type: inputType, truncate: "NONE" } }
          : { model: config.model, input: texts, encoding_format: "float" }),
      });
      if (!response.ok) throw new Error();
      body = await response.json();
    } catch { throw new Error("Memory embedding provider unavailable"); }
    const common = { model: z.literal(config.model), usage: z.object({ total_tokens: z.number().int().nonnegative() }) };
    if (native) {
      const parsed = z.object({ ...common, vector_type: z.literal("dense"),
        data: z.array(z.object({ values: vector, vector_type: z.literal("dense").optional() })).length(texts.length),
      }).safeParse(body);
      if (!parsed.success) throw new Error("Invalid embedding response");
      usage.embeddingTokens += parsed.data.usage.total_tokens;
      return parsed.data.data.map(row => row.values);
    }
    const parsed = z.object({ ...common,
      data: z.array(z.object({ index: z.number().int().nonnegative(), embedding: vector })).length(texts.length),
    }).safeParse(body);
    if (!parsed.success) throw new Error("Invalid embedding response");
    const ordered = parsed.data.data.sort((a, b) => a.index - b.index);
    if (ordered.some((row, i) => row.index !== i)) throw new Error("Invalid embedding response");
    usage.embeddingTokens += parsed.data.usage.total_tokens;
    return ordered.map(row => row.embedding);
  }
  return { embedBatch, embed: async (text: string, signal: AbortSignal) => (await embedBatch([text], signal, "query"))[0], usage };
}
