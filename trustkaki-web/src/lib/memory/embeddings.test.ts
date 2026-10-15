import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createMemoryEmbeddings } from "./embeddings";
const config = { endpoint: "https://api.pinecone.io/embed", apiKey: "private-key", model: "llama-text-embed-v2" };
const vector = Array.from({ length: 1024 }, (_, i) => i === 0 ? 1 : 0);
const response = (values = vector) => new Response(JSON.stringify({ model: config.model, vector_type: "dense",
  data: [{ values }], usage: { total_tokens: 3 } }));
it("uses passage and query modes without a vector database dependency", async () => {
  const send = vi.fn(async () => response());
  const client = createMemoryEmbeddings(config, send);
  const signal = new AbortController().signal;
  expect(await client.embedBatch(["saved fact"], signal)).toEqual([vector]);
  expect(await client.embed("question", signal)).toEqual(vector);
  expect(client.usage.embeddingTokens).toBe(6);
  expect(send.mock.calls.map(call => JSON.parse(String((call as unknown as [string, RequestInit])[1].body)).parameters.input_type)).toEqual(["passage", "query"]);
});
it("rejects unsafe endpoints, oversized inputs and wrong dimensions", async () => {
  const send = vi.fn(async () => response([1]));
  expect(() => createMemoryEmbeddings({ ...config, endpoint: "http://example.com/embeddings" }, send)).toThrow();
  const client = createMemoryEmbeddings(config, send);
  await expect(client.embed("x".repeat(2001), AbortSignal.timeout(1000))).rejects.toThrow("Invalid embedding input");
  expect(send).not.toHaveBeenCalled();
  await expect(client.embed("fact", AbortSignal.timeout(1000))).rejects.toThrow("Invalid embedding response");
  expect(client.usage.embeddingTokens).toBe(0);
});
it("orders OpenAI-compatible responses and keeps provider failures private", async () => {
  const client = createMemoryEmbeddings({ ...config, endpoint: "https://example.com/v1/embeddings" }, async () => new Response(JSON.stringify({
    model: config.model, data: [{ index: 1, embedding: vector }, { index: 0, embedding: vector }], usage: { total_tokens: 6 },
  })));
  expect(await client.embedBatch(["one", "two"], AbortSignal.timeout(1000))).toHaveLength(2);
  const broken = createMemoryEmbeddings(config, async () => { throw new Error("private-key private-content"); });
  await expect(broken.embed("fact", AbortSignal.timeout(1000))).rejects.toThrow(/^Memory embedding provider unavailable$/);
});
it("rejects zero vectors and malformed JSON without leaking response content", async () => {
  const zero = createMemoryEmbeddings(config, async () => response(Array(1024).fill(0)));
  await expect(zero.embed("fact", AbortSignal.timeout(1000))).rejects.toThrow("Invalid embedding response");
  const malformed = createMemoryEmbeddings(config, async () => new Response("private response"));
  await expect(malformed.embed("fact", AbortSignal.timeout(1000))).rejects.toThrow(/^Memory embedding provider unavailable$/);
});
