import { memoryEvaluationCases, memoryEvaluationSeniorId } from "./memoryCases";
import type { MemorySourceRecord } from "@/lib/memory/retrievalContracts";

export const retrievalDatasetVersion = "fictional-memory-v1";
export const retrievalEvaluationScope = { organisationId: "00000000-0000-4000-8000-000000000010", seniorId: memoryEvaluationSeniorId };
export const retrievalEvaluationTime = "2026-10-14T00:00:00.000Z";
export function fictionalRecord(id: string, content: string, overrides: Partial<MemorySourceRecord> = {}): MemorySourceRecord {
  return { ...retrievalEvaluationScope, id, contextKey: id, content, sourceRef: `fictional:${id}`,
    evidenceExcerpt: content, confirmedAt: "2026-07-01T00:00:00.000Z", expiresAt: null,
    status: "active", version: 1, conflictGroup: null, unresolvedConflict: false, safeUseNotes: null, ...overrides };
}

// Keep old required/forbidden targets intact. Explicit conflict metadata is a new input contract.
export const retrievalGuardCases = memoryEvaluationCases.map(c => ({
  ...c,
  records: c.memories.map(row => fictionalRecord(String(row.context_key), String(row.content), {
    seniorId: String(row.senior_id), confirmedAt: String(row.last_confirmed_at),
    expiresAt: row.expires_at === null ? null : String(row.expires_at),
    status: row.status as MemorySourceRecord["status"],
    ...(c.id === "conflicting_active_facts" ? { conflictGroup: "group_activity", unresolvedConflict: true } : {}),
  })),
}));

export const pilotRecords = [
  fictionalRecord("gardening", "I enjoy gardening at the community centre."),
  fictionalRecord("contact", "I prefer text messages instead of phone calls.", { version: 2, conflictGroup: "contact_method" }),
  fictionalRecord("old_contact", "I prefer phone calls instead of text messages.", { status: "superseded", conflictGroup: "contact_method" }),
  fictionalRecord("expired_dance", "I want to attend dancing this week.", { expiresAt: "2026-07-08T00:00:00.000Z" }),
  fictionalRecord("walk", "My usual exercise is a walk in the morning."),
  fictionalRecord("breakfast", "My favourite breakfast is porridge."),
  fictionalRecord("visits", "I prefer gentle one-to-one visits rather than large group gatherings."),
  ...Array.from({ length: 1000 }, (_, i) => fictionalRecord(`distractor-${i}`, `Fictional inventory note ${i}: a spare household item is kept in storage.`)),
];
const questions = [
  ["gardening", ["What activity do I enjoy at the community centre?", "Do I have an interest in growing plants?"],
    ["我喜欢在社区中心参加什么活动？", "我喜欢种花种草吗？"],
    ["Last time centre what activity I like ah?", "Gardening at centre still got or not? I liked it last time."]],
  ["contact", ["How do I prefer to be contacted?", "Would I rather get a text or a call?"],
    ["我喜欢别人怎么联系我？", "我更喜欢短信还是电话？"],
    ["Contact me how I prefer ah?", "Text or call, which one I like better leh?"]],
  ["walk", ["What exercise is part of my usual routine?", "When do I normally take a walk?"],
    ["我平常做什么运动？", "我通常什么时候散步？"],
    ["My usual exercise is what ah?", "I normally go walk morning or night leh?"]],
  ["breakfast", ["What is my favourite breakfast?", "What do I like eating in the morning?"],
    ["我最喜欢吃什么早餐？", "早上我喜欢吃什么？"],
    ["Breakfast I like eat what ah?", "Morning makan, what I prefer leh?"]],
  ["visits", ["What type of social visit do I prefer?", "Do I prefer one-to-one visits or big gatherings?"],
    ["我喜欢什么样的探访？", "我喜欢一对一探访还是大型聚会？"],
    ["Visit me one-to-one or big group, I prefer which ah?", "Meet people how I more comfortable leh?"]],
] as const;
const forbiddenKeys = ["old_contact", "expired_dance", ...Array.from({ length: 1000 }, (_, i) => `distractor-${i}`)];
export const pilotQuestions = questions.flatMap(([key, english, mandarin, singlish]) =>
  ([english, mandarin, singlish] as const).flatMap((texts, i) => texts.map((query, j) => ({
    id: `${key}-${i}-${j}`, language: ["English", "Mandarin", "Singlish"][i], query, requiredKeys: [key], forbiddenKeys,
  }))));
