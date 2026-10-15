import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const { query, automatic, manual, transact } = vi.hoisted(() => ({ query: vi.fn(), automatic: vi.fn(), manual: vi.fn(), transact: vi.fn() }));
vi.mock("./neonDatabase", () => ({ neonMemorySql: query, withNeonMemoryTransaction: transact }));
vi.mock("./applicationCommands", () => ({ createApplicationMemoryCommands: () => ({ automatic, manual }) }));
import { resolveMemoryScope, applyNeonAutomaticMemory, mutateNeonPersonalMemory, withOperationalMemoryPurpose, retrieveNeonPersonalMemory } from "./applicationRepository";
import type { TrustKakiClient } from "@/lib/persistence/persistenceSupport";
const seniorId = "00000000-0000-4000-8000-000000000011";
const organisationId = "00000000-0000-4000-8000-000000000012";
const sourceMessageId = "00000000-0000-4000-8000-000000000013";
const caregiverId = "00000000-0000-4000-8000-000000000014";
const command = { commandId: crypto.randomUUID(), seniorId, sourceMessageId,
  payload: { decision: "accepted", store: "memory", intent: "create", context_key: "breakfast", memory_type: "food_preference",
    content: "Likes porridge", evidence_excerpt: "I like porridge for breakfast", confidence: 0.95,
    application_tags: ["practical_meal_prompt"], expires_at: "2027-01-01T00:00:00.000Z" } };
function client(rows: Record<string, unknown>) {
  const filters: unknown[][] = [];
  return { filters, db: { from: (table: string) => {
    const builder = { select: () => builder, eq: (...args: unknown[]) => { filters.push([table, ...args]); return builder; },
      overlaps: () => builder, limit: () => builder, abortSignal: () => builder,
      maybeSingle: async () => ({ data: rows[table] ?? null, error: null }) };
    return builder;
  } } as unknown as TrustKakiClient };
}
beforeEach(() => { vi.clearAllMocks(); query.mockResolvedValue([]); transact.mockImplementation(async (_s, work) => work(query)); vi.stubEnv("TRUSTKAKI_MEMORY_EMBEDDING_MODEL", "fictional-model"); });
it("requires a real senior row for scope and never accepts organisation from a request", async () => {
  await expect(resolveMemoryScope(client({}).db, seniorId)).rejects.toThrow();
  expect(await resolveMemoryScope(client({ seniors: { id: seniorId, organisation_id: organisationId } }).db, seniorId)).toEqual({ organisationId, seniorId });
  await expect(resolveMemoryScope(client({ seniors: { id: crypto.randomUUID(), organisation_id: organisationId } }).db, seniorId)).rejects.toThrow();
});
it("fetches evidence scoped to the senior before the Neon writer runs", async () => {
  const c = client({ seniors: { id: seniorId, organisation_id: organisationId },
    messages: { id: sourceMessageId, senior_id: seniorId, sender: "senior", text: "I like porridge for breakfast", created_at: "2026-10-15T00:00:00.000Z" } });
  automatic.mockResolvedValue({ id: crypto.randomUUID(), version: 1, status: "active", duplicate: false });
  await applyNeonAutomaticMemory(c.db, command);
  expect(c.filters).toContainEqual(["messages", "senior_id", seniorId]);
  expect(c.filters).toContainEqual(["messages", "id", sourceMessageId]);
  expect(automatic).toHaveBeenCalledWith({ organisationId, seniorId }, expect.objectContaining({ commandId: command.commandId,
    sourceMessage: expect.objectContaining({ id: sourceMessageId, sender: "senior" }), candidate: expect.objectContaining({ memoryType: "food_preference" }) }));
});
it("rejects foreign or non-senior provenance before Neon", async () => {
  for (const changed of [{ senior_id: crypto.randomUUID(), sender: "senior" }, { senior_id: seniorId, sender: "system" }]) {
    const c = client({ seniors: { id: seniorId, organisation_id: organisationId }, messages: { id: sourceMessageId, text: "evidence", created_at: "2026-10-15T00:00:00.000Z", ...changed } });
    await expect(applyNeonAutomaticMemory(c.db, command)).rejects.toThrow();
  }
  expect(automatic).not.toHaveBeenCalled();
});
it("uses RLS-scoped senior visibility and verified admin identity for manual edits", async () => {
  const c = client({ seniors: { id: seniorId, organisation_id: organisationId } });
  manual.mockResolvedValue({ id: crypto.randomUUID(), version: 2, status: "superseded", duplicate: false });
  const edit = { action: "archive", store: "memory", commandId: crypto.randomUUID(), contextId: crypto.randomUUID(),
    expectedUpdatedAt: "2026-10-15T00:00:00.000Z", reason: "Caregiver confirmed archive" };
  await mutateNeonPersonalMemory(c.db, seniorId, caregiverId, edit);
  expect(manual).toHaveBeenCalledWith({ organisationId, seniorId }, caregiverId, edit, expect.any(String));
  await expect(mutateNeonPersonalMemory(client({}).db, seniorId, caregiverId, edit)).rejects.toThrow();
  expect(manual).toHaveBeenCalledTimes(1);
});

it("rejects active context-key collisions across stores in both directions", async () => {
  const c = client({ seniors: { id: seniorId, organisation_id: organisationId }, senior_memories: { id: crypto.randomUUID() },
    messages: { id: sourceMessageId, senior_id: seniorId, sender: "senior", text: "I like porridge for breakfast", created_at: "2026-10-15T00:00:00.000Z" } });
  await expect(applyNeonAutomaticMemory(c.db, command)).rejects.toThrow("Memory conflict");
  expect(automatic).not.toHaveBeenCalled();
  query.mockImplementation(async (sql) => sql.includes("FROM personal_memory.records") ? [{ id: crypto.randomUUID() }] : []);
  const write = vi.fn();
  await expect(withOperationalMemoryPurpose(c.db, command, write)).rejects.toThrow("Memory conflict");
  expect(write).not.toHaveBeenCalled();
});
it("checks original backend receipts before mutable purpose checks on retry", async () => {
  const c = client({ seniors: { id: seniorId, organisation_id: organisationId }, senior_memories: { id: crypto.randomUUID() },
    messages: { id: sourceMessageId, senior_id: seniorId, sender: "senior", text: "I like porridge for breakfast", created_at: "2026-10-15T00:00:00.000Z" } });
  query.mockImplementation(async (sql) => sql.includes("FROM personal_memory.commands") ? [{ command_id: command.commandId }] : []);
  automatic.mockResolvedValue({ id: crypto.randomUUID(), version: 1, status: "active", duplicate: true });
  expect(await applyNeonAutomaticMemory(c.db, command)).toMatchObject({ duplicate: true });
  expect(c.filters.filter(row => row[0] === "senior_memories")).toEqual([]);
});

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("keeps indexed facts retrievable when an unrelated pending batch cannot be embedded", async () => {
  vi.stubEnv("TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT", "https://embedding.example/embeddings");
  vi.stubEnv("TRUSTKAKI_MEMORY_EMBEDDING_API_KEY", "fictional-key");
  vi.stubEnv("TRUSTKAKI_MEMORY_MIN_SCORE", "0.2");
  const now = "2026-10-15T00:00:00.000Z";
  const source = { organisationId, seniorId, id: "ready", contextKey: "breakfast", content: "Likes porridge", sourceRef: "fictional:message",
    evidenceExcerpt: "I like porridge", confirmedAt: now, expiresAt: null, status: "active", version: 1,
    conflictGroup: null, unresolvedConflict: false, safeUseNotes: null };
  query.mockImplementation(async (_scope, sql) => {
    if (sql.includes("embedding IS NULL")) return [{ source: { ...source, id: "pending" } }];
    if (sql.includes("1 - (embedding")) return [{ organisationId, seniorId, id: "ready", sourceVersion: 1, indexVersion: 1, embeddingModel: "fictional-model", score: 0.9 }];
    return [{ source }];
  });
  const send = vi.fn().mockResolvedValueOnce(new Response("", { status: 400 })).mockResolvedValueOnce(Response.json({
    model: "fictional-model", usage: { total_tokens: 5 }, data: [{ index: 0, embedding: [1, ...Array(1023).fill(0)] }],
  }));
  vi.stubGlobal("fetch", send);
  const result = await retrieveNeonPersonalMemory({ organisationId, seniorId }, "What breakfast?", now);
  expect(result.status).toBe("available");
  expect(JSON.parse(result.contextJson).items[0].content).toBe(source.content);
  expect(send).toHaveBeenCalledTimes(2);
});
