import { afterEach, beforeEach, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ user: vi.fn(), service: vi.fn(), scope: vi.fn(), read: vi.fn(), automatic: vi.fn(), manual: vi.fn(), tags: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createTrustKakiUserClient: mocks.user, createTrustKakiServiceClient: mocks.service }));
vi.mock("@/lib/memory/applicationRepository", () => ({ isNeonPersonalMemoryEnabled: () => true, resolveMemoryScope: mocks.scope,
  readNeonPersonalMemory: mocks.read, readNeonMemoryTags: mocks.tags, applyNeonAutomaticMemory: mocks.automatic, mutateNeonPersonalMemory: mocks.manual, withOperationalMemoryPurpose: vi.fn() }));
import { applyAutomaticSeniorContext, readSeniorContext, mutateSeniorContext } from "./memoryRepository";
const seniorId = "00000000-0000-4000-8000-000000000011";
const commandId = "00000000-0000-4000-8000-000000000012";
const contextId = "00000000-0000-4000-8000-000000000013";
const caregiverId = "00000000-0000-4000-8000-000000000014";
const scope = { seniorId, organisationId: "00000000-0000-4000-8000-000000000015" };
const queries: { table: string; operational: boolean }[] = [];
function client() {
  return { rpc: vi.fn(), from(table: string) {
    const record = { table, operational: false }; queries.push(record);
    const b = { select: () => b, eq: () => b, or: () => b, order: () => b,
      overlaps: () => { record.operational = true; return b; },
      maybeSingle: async () => ({ data: null, error: null }),
      then: (resolve: (r: unknown) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve) };
    return b;
  } };
}
beforeEach(() => { vi.clearAllMocks(); queries.length = 0; mocks.scope.mockResolvedValue(scope); mocks.read.mockResolvedValue([]); mocks.tags.mockResolvedValue([]); });
afterEach(() => vi.unstubAllEnvs());
it("reads personal facts from Neon and restricts legacy reads to essential operational tags", async () => {
  const db = client(); mocks.user.mockReturnValue(db);
  await readSeniorContext({ accessToken: "verified-token", seniorId, now: "2026-10-15T00:00:00.000Z" });
  expect(mocks.scope).toHaveBeenCalledWith(db, seniorId);
  expect(mocks.read).toHaveBeenCalledWith(scope, "2026-10-15T00:00:00.000Z");
  expect(queries.filter(q => q.table === "senior_memories")).toEqual([{ table: "senior_memories", operational: true }]);
});
it("does not fall back to Supabase personal rows during Neon outages", async () => {
  mocks.user.mockReturnValue(client()); mocks.read.mockRejectedValue(new Error("Personal memory unavailable"));
  await expect(readSeniorContext({ accessToken: "token", seniorId, now: "2026-10-15T00:00:00.000Z" })).rejects.toThrow();
  expect(queries.filter(q => q.table === "senior_memories").every(q => q.operational)).toBe(true);
});
it("routes accepted personal extraction to Neon without calling the legacy writer", async () => {
  const db = client(); mocks.automatic.mockResolvedValue({ accepted: true, store: "memory", context_id: contextId, event: "proposal_accepted", duplicate: false });
  const c = { commandId, seniorId, sourceMessageId: contextId,
    payload: { store: "memory", decision: "accepted", memory_type: "food_preference", application_tags: ["practical_meal_prompt"] } };
  await applyAutomaticSeniorContext(db as never, c);
  expect(mocks.automatic).toHaveBeenCalledWith(db, c);
  expect(db.rpc).not.toHaveBeenCalled();
});
it("requires verified admin access for Neon caregiver writes", async () => {
  mocks.user.mockReturnValue(client());
  const c = { commandId, contextId, store: "memory" as const, action: "archive" as const,
    expectedUpdatedAt: "2026-10-15T00:00:00.000Z", reason: "Archive confirmed by caregiver" };
  await expect(mutateSeniorContext({ accessToken: "token", seniorId, command: c })).rejects.toThrow("Forbidden");
  expect(mocks.manual).not.toHaveBeenCalled();
  const auth = { caregiverId, administrableSeniorIds: [seniorId] };
  await mutateSeniorContext({ accessToken: "token", seniorId, command: c, auth: auth as never });
  expect(mocks.manual).toHaveBeenCalledWith(expect.anything(), seniorId, caregiverId, c);
});
