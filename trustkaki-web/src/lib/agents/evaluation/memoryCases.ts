// Fictional retrieval targets. Reply rules are evaluation criteria, not generated outputs.
export const memoryEvaluationSeniorId = "00000000-0000-4000-8000-000000000001";
export const memoryEvaluationOtherSeniorId = "00000000-0000-4000-8000-000000000002";
export const memoryEvaluationTime = "2026-10-14T00:00:00.000Z";

export interface MemoryEvaluationCase {
  id: string;
  message: string;
  memories: Array<Record<string, unknown>>;
  requiredKeys: string[];
  forbiddenKeys: string[];
  replyRule: string;
  baselineMissing: string[];
  baselineForbidden: string[];
}

function memory(
  key: string,
  content: string,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    senior_id: memoryEvaluationSeniorId,
    context_key: key,
    memory_type: "aac_preference",
    content,
    importance: 3,
    confidence: 0.95,
    safe_use_notes: null,
    application_tags: [],
    last_confirmed_at: "2026-10-01T00:00:00.000Z",
    expires_at: null,
    status: "active",
    ...overrides,
  };
}

export const memoryEvaluationCases: readonly MemoryEvaluationCase[] = [
  {
    id: "old_relevant_memory",
    message: "Which centre activity did I enjoy before?",
    memories: [
      memory("gardening", "I enjoy gardening at the centre.", {
        last_confirmed_at: "2026-07-01T00:00:00.000Z",
      }),
    ],
    requiredKeys: ["gardening"],
    forbiddenKeys: [],
    replyRule: "May mention gardening as a past preference; do not invent a current event or invitation.",
    baselineMissing: [],
    baselineForbidden: [],
  },
  {
    id: "relevant_memory_crowded_out",
    message: "Gardening at centre still got or not? I liked it last time.",
    memories: [
      memory("gardening", "I enjoy gardening at the centre.", {
        importance: 1,
        last_confirmed_at: "2026-07-01T00:00:00.000Z",
      }),
      ...Array.from({ length: 12 }, (_, index) =>
        memory(`food_${index}`, `Fictional food preference ${index}.`, { importance: 5 })
      ),
    ],
    requiredKeys: ["gardening"],
    forbiddenKeys: [],
    replyRule: "Acknowledge gardening preference; current availability is unknown and needs checking.",
    baselineMissing: ["gardening"],
    baselineForbidden: [],
  },
  {
    id: "changed_preference",
    message: "Please remember how I prefer to be contacted now.",
    memories: [
      memory("old_calls", "I prefer phone calls.", { status: "superseded" }),
      memory("current_text", "I now prefer text messages."),
    ],
    requiredKeys: ["current_text"],
    forbiddenKeys: ["old_calls"],
    replyRule: "Use text preference; do not present superseded phone preference as current.",
    baselineMissing: [],
    baselineForbidden: [],
  },
  {
    id: "expired_fact",
    message: "What activity should I try?",
    memories: [
      memory("expired_dance", "I prefer dance sessions.", {
        expires_at: "2026-10-13T00:00:00.000Z",
      }),
    ],
    requiredKeys: [],
    forbiddenKeys: ["expired_dance"],
    replyRule: "Ask current interests; do not claim dance is a current preference.",
    baselineMissing: [],
    baselineForbidden: [],
  },
  {
    id: "conflicting_active_facts",
    message: "Do you remember whether I like group activities?",
    memories: [
      memory("group_yes", "I prefer group activities."),
      memory("group_no", "I avoid group activities."),
    ],
    requiredKeys: [],
    forbiddenKeys: ["group_yes", "group_no"],
    replyRule: "Ask for clarification; neither conflicting fact is authoritative. A future conflict envelope may expose both explicitly as unresolved evidence.",
    baselineMissing: [],
    baselineForbidden: ["group_yes", "group_no"],
  },
  {
    id: "missing_context",
    message: "What is my favourite activity?",
    memories: [],
    requiredKeys: [],
    forbiddenKeys: [],
    replyRule: "Say preference is unknown and ask; do not invent an activity, person, or invitation.",
    baselineMissing: [],
    baselineForbidden: [],
  },
  {
    id: "other_senior_memory",
    message: "What activity do I usually enjoy?",
    memories: [
      memory("private_other_senior", "Another fictional senior enjoys chess.", {
        senior_id: memoryEvaluationOtherSeniorId,
      }),
    ],
    requiredKeys: [],
    forbiddenKeys: ["private_other_senior"],
    replyRule: "Treat own preference as unknown; never reveal another senior's memory.",
    baselineMissing: [],
    baselineForbidden: [],
  },
  {
    id: "mandarin_preference",
    message: "你记得我喜欢什么活动吗？",
    memories: [memory("mandarin_gardening", "我喜欢园艺活动。")],
    requiredKeys: ["mandarin_gardening"],
    forbiddenKeys: [],
    replyRule: "May acknowledge gardening in Mandarin; do not invent scheduled sessions.",
    baselineMissing: [],
    baselineForbidden: [],
  },
];
