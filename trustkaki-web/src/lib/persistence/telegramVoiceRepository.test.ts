import { beforeEach, describe, expect, it, vi } from "vitest";
const { rpc, maybeSingle, eq, select, from } = vi.hoisted(() => ({ rpc: vi.fn(), maybeSingle: vi.fn(), eq: vi.fn(), select: vi.fn(), from: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({ createTrustKakiServiceClient: () => ({ rpc, from }) }));
import { prepareVoiceDraft, stageVoiceDraft, confirmVoiceDraft, getVoiceDraft, expireVoiceDrafts, reserveVoiceInference } from "./telegramVoiceRepository";
const actor = { seniorId: "s", senderUserId: "u", chatId: "c" };
beforeEach(() => { vi.clearAllMocks(); rpc.mockResolvedValue({ data: null, error: null }); from.mockReturnValue({ select }); select.mockReturnValue({ eq }); eq.mockReturnValue({ maybeSingle }); });
describe("voice draft repository", () => {
 it("passes actor binding and handles denied preparation", async () => {
  expect(await prepareVoiceDraft({ ...actor, eventId: "e" })).toBeNull();
  expect(rpc).toHaveBeenCalledWith("prepare_telegram_voice_draft", { p_event_id: "e", p_senior_id: "s", p_sender_user_id: "u", p_chat_id: "c" });
  rpc.mockResolvedValueOnce({ data: [{ id: "d", transcript: "private" }], error: null });
  expect(await prepareVoiceDraft({ ...actor, eventId: "e" })).toEqual({ id: "d" });
 });
 it("stages transcripts and confirms using the durable RPC", async () => {
  rpc.mockResolvedValueOnce({ data: true, error: null });
  expect(await stageVoiceDraft({ draftId: "d", transcript: "hello" })).toBe(true);
  rpc.mockResolvedValueOnce({ data: "event", error: null });
  expect(await confirmVoiceDraft({ ...actor, draftId: "d", action: "confirm" })).toBe("event");
  expect(rpc).toHaveBeenLastCalledWith("finish_telegram_voice_draft", { p_draft_id: "d", p_senior_id: "s", p_sender_user_id: "u", p_chat_id: "c", p_action: "confirm" });
 });
 it("recovers staged drafts after cleaning expired transcripts", async () => {
  const draft = { id: "d", status: "pending", transcript: "hello" };
  maybeSingle.mockResolvedValue({ data: draft, error: null });
  expect(await getVoiceDraft("e")).toEqual(draft);
  expect(rpc).toHaveBeenCalledWith("expire_telegram_voice_drafts");
  expect(eq).toHaveBeenCalledWith("event_id", "e");
 });
 it("reserves inference once through the durable gate", async () => {
  rpc.mockResolvedValueOnce({ data: true, error: null });
  expect(await reserveVoiceInference("d")).toBe(true);
  expect(rpc).toHaveBeenCalledWith("reserve_telegram_voice_inference", { p_draft_id: "d" });
  expect(await reserveVoiceInference("d")).toBe(false);
 });
 it("does not expose database error content", async () => {
  rpc.mockResolvedValue({ data: null, error: { message: "sensitive transcript" } });
  await expect(expireVoiceDrafts()).rejects.toThrow("Voice draft storage operation failed");
 });
});
