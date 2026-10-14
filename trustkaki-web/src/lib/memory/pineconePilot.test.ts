import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { createPineconePilot } from "./pineconePilot";
import { fictionalRecord, pilotRecords, retrievalEvaluationScope as scope, retrievalEvaluationTime as now } from "@/lib/agents/evaluation/memoryRetrievalCases";
const config = { host: "https://fictional.svc.test.pinecone.io", apiKey: "test-pinecone-key",
  namespace: "trustkaki-fictional-memory-pilot-test", embeddingEndpoint: "https://embedding.example/v1/embeddings",
  embeddingApiKey: "test-embedding-key", embeddingModel: "test-embedding-v1", minimumScore: 0.3 };
const ok = (body: unknown) => new Response(JSON.stringify(body), { status: 200 });

it("posts bounded scope/status/expiry/model filters with no vector values", async () => {
  const send = vi.fn(async () => ok({ matches: [{ id: "gardening", score: 0.9, metadata: {
    organisation_id: scope.organisationId, senior_id: scope.seniorId, source_version: 1, index_version: 1, embedding_model: config.embeddingModel,
  } }], usage: { readUnits: 1 } }));
  const adapter = createPineconePilot(config, send);
  const signal = new AbortController().signal;
  expect(await adapter.search({ scope, vector: [1, 0], topK: 20, now }, signal)).toEqual([
    { ...scope, id: "gardening", score: 0.9, sourceVersion: 1, indexVersion: 1, embeddingModel: config.embeddingModel },
  ]);
  const [url, request] = send.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe(`${config.host}/query`); expect(request.signal).toBe(signal);
  expect(request.redirect).toBe("error");
  expect(request.headers).toMatchObject({ "X-Pinecone-Api-Version": "2026-07" });
  expect(JSON.parse(String(request.body))).toMatchObject({ namespace: config.namespace, topK: 20, includeValues: false, includeMetadata: true,
    filter: { $and: [{ organisation_id: { $eq: scope.organisationId } }, { senior_id: { $eq: scope.seniorId } },
      { status: { $eq: "active" } }, { expires_at_ms: { $gt: Date.parse(now) } }, { embedding_model: { $eq: config.embeddingModel } }] },
  });
  expect(adapter.usage.readUnits).toBe(1);
});
it("validates embedding model, order, finite numbers and token usage", async () => {
  const send = vi.fn(async () => ok({ model: config.embeddingModel,
    data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }], usage: { total_tokens: 6 } }));
  const adapter = createPineconePilot(config, send);
  expect(await adapter.embedBatch(["first", "second"], new AbortController().signal)).toEqual([[1, 0], [0, 1]]);
  expect(adapter.usage.embeddingTokens).toBe(6);
});
it.each([
  { model: "wrong", data: [{ index: 0, embedding: [1] }] },
  { model: config.embeddingModel, data: [{ index: 0, embedding: [] }] },
  { model: config.embeddingModel, data: [{ index: 1, embedding: [1] }] },
  { model: config.embeddingModel, data: [] },
])("rejects malformed embedding response without raw payload", async response => {
  const adapter = createPineconePilot(config, async () => ok(response));
  await expect(adapter.embed("fictional", new AbortController().signal)).rejects.toThrow("Invalid embedding response");
});
it("upserts only generated fictional records in an explicit pilot namespace", async () => {
  const send = vi.fn(async () => ok({ upsertedCount: 1 }));
  const adapter = createPineconePilot(config, send);
  await adapter.upsert([pilotRecords[0]], [[1, 0]], new AbortController().signal);
  const request = (send.mock.calls[0] as unknown as [string, RequestInit])[1];
  expect(JSON.parse(String(request.body)).vectors[0].metadata).toMatchObject({ source_version: 1, index_version: 1, status: "active" });
  await expect(adapter.upsert([fictionalRecord("real", "Private", { sourceRef: "database:real-message" })], [[1, 0]], new AbortController().signal)).rejects.toThrow();
  expect(send).toHaveBeenCalledTimes(1);
});
it.each([
  { host: "http://evil.example" }, { host: "https://evil.example" }, { namespace: "production" },
  { embeddingEndpoint: "https://user:password@embedding.example/v1/embeddings" },
  { embeddingEndpoint: "https://embedding.example/v1/embeddings?key=secret" },
])("rejects unsafe pilot configuration before network", override => {
  const send = vi.fn(); expect(() => createPineconePilot({ ...config, ...override }, send)).toThrow(); expect(send).not.toHaveBeenCalled();
});
it("does not reveal a provider error body", async () => {
  const adapter = createPineconePilot(config, async () => new Response("secret private content", { status: 500 }));
  await expect(adapter.embed("fictional", new AbortController().signal)).rejects.toThrow(/^Memory pilot provider request failed$/);
});
it("reads only the isolated namespace count and index dimensions for readiness", async () => {
  const adapter = createPineconePilot(config, async () => ok({ dimension: 2, namespaces: {
    [config.namespace]: { vectorCount: 1005 }, production: { vectorCount: 99999 },
  } }));
  expect(await adapter.indexState(new AbortController().signal)).toEqual({ dimension: 2, count: 1005 });
});

const nativeConfig = { ...config, embeddingEndpoint: "https://api.pinecone.io/embed",
  embeddingApiKey: "", embeddingModel: "llama-text-embed-v2" };
const nativeResponse = { model: "llama-text-embed-v2", vector_type: "dense",
  data: [{ vector_type: "dense", values: [1, 0] }], usage: { total_tokens: 3 } };
it("uses Pinecone auth and passage/query modes without truncating input", async () => {
  const send = vi.fn(async () => ok(nativeResponse));
  const adapter = createPineconePilot(nativeConfig, send);
  const signal = new AbortController().signal;
  expect(await adapter.embedBatch(["saved fact"], signal)).toEqual([[1, 0]]);
  expect(await adapter.embed("question", signal)).toEqual([1, 0]);
  expect(adapter.usage.embeddingTokens).toBe(6);
  for (const [i, inputType] of ["passage", "query"].entries()) {
    const [url, request] = send.mock.calls[i] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.pinecone.io/embed");
    expect(request.signal).toBe(signal); expect(request.redirect).toBe("error");
    expect(request.headers).toMatchObject({ "Api-Key": config.apiKey, "X-Pinecone-Api-Version": "2026-07" });
    expect(request.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(String(request.body))).toEqual({ model: nativeConfig.embeddingModel,
      inputs: [{ text: i ? "question" : "saved fact" }], parameters: { input_type: inputType, truncate: "NONE" } });
  }
});
it.each([
  { ...nativeResponse, model: "wrong" }, { ...nativeResponse, vector_type: "sparse" },
  { ...nativeResponse, data: [{ values: [] }] }, { ...nativeResponse, data: [] },
  { ...nativeResponse, usage: {} },
])("rejects malformed native embedding response", async response => {
  const adapter = createPineconePilot(nativeConfig, async () => ok(response));
  await expect(adapter.embed("question", new AbortController().signal)).rejects.toThrow("Invalid embedding response");
  expect(adapter.usage.embeddingTokens).toBe(0);
});
it("rejects native responses with inconsistent widths", async () => {
  const adapter = createPineconePilot(nativeConfig, async () => ok({ ...nativeResponse,
    data: [{ values: [1] }, { values: [1, 0] }] }));
  await expect(adapter.embedBatch(["first", "second"], new AbortController().signal)).rejects.toThrow("Invalid embedding response");
});
it("does not treat another host's /embed endpoint as Pinecone", () => {
  const send = vi.fn();
  expect(() => createPineconePilot({ ...nativeConfig, embeddingEndpoint: "https://evil.example/embed" }, send)).toThrow();
  expect(send).not.toHaveBeenCalled();
});
it("rejects native embedding batches above hosted-model limit before network", async () => {
  const send = vi.fn(); const adapter = createPineconePilot(nativeConfig, send);
  await expect(adapter.embedBatch(Array(97).fill("fact"), new AbortController().signal)).rejects.toThrow("Invalid embedding input");
  expect(send).not.toHaveBeenCalled();
});
