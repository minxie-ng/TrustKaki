import { pathToFileURL } from "node:url";
import { pilotRecords, retrievalEvaluationTime } from "../src/lib/agents/evaluation/memoryRetrievalCases";

export function cosine(a: number[], b: number[]): number {
  if (!a.length || a.length !== b.length || [...a, ...b].some(v => !Number.isFinite(v))) throw new Error("Invalid vectors");
  const norm = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0) * b.reduce((sum, v) => sum + v * v, 0));
  if (!norm || !Number.isFinite(norm)) throw new Error("Invalid vectors");
  return Math.max(-1, Math.min(1, a.reduce((sum, v, i) => sum + v * b[i], 0) / norm));
}
export function selectThreshold(positive: number[], forbidden: number[]): number | null {
  if (!positive.length || !forbidden.length || [...positive, ...forbidden].some(v => !Number.isFinite(v) || v < -1 || v > 1)) {
    throw new Error("Invalid calibration scores");
  }
  const lower = Math.max(...forbidden); const upper = Math.min(...positive);
  return upper > lower ? (upper + lower) / 2 : null;
}
const groups = [
  ["gardening", "Which hobby involving soil and seedlings appeals to me?", "我愿意在社区照料植物吗？", "Go centre look after plants, I keen anot?"],
  ["contact", "Should someone message me rather than ring my phone?", "联系我时应该发文字消息吗？", "Want reach me, send message better right?"],
  ["walk", "Describe my regular physical activity and its time of day.", "我的日常锻炼习惯是什么？", "My daily keep fit habit, tell me about it lah."],
  ["breakfast", "Which food would suit my preferred first meal of the day?", "按我的口味，早餐吃哪种食物？", "Wake up hungry, what food I usually fancy?"],
  ["visits", "Would a quiet individual visit suit my social preferences?", "安静的单独探访符合我的喜好吗？", "Come visit just one person, I more happy like that?"],
];
export const calibrationQuestions: Array<{ id: string; query: string; requiredKey: string | null }> = [...groups.flatMap(([key, ...queries]) =>
  queries.map((query, i) => ({ id: `calibration-${key}-${i}`, query, requiredKey: key }))), ...[
    "What is the capital of Norway?", "Explain how a solar eclipse happens.", "火星和地球哪个更大？",
    "How to calculate 17 times 23?", "Wi-Fi router setup instructions please.",
  ].map((query, i) => ({ id: `calibration-negative-${i}`, query, requiredKey: null }))];

async function main() {
  if (process.argv.slice(2).join(" ") !== "--confirm-live --confirm-provider-budget") throw new Error();
  const required = (suffix: string) => {
    const value = process.env[`TRUSTKAKI_MEMORY_${suffix}`]?.trim();
    if (!value) throw new Error(); return value;
  };
  if (required("EMBEDDING_ENDPOINT") !== "https://api.pinecone.io/embed"
    || required("EMBEDDING_MODEL") !== "llama-text-embed-v2"
    || !(Number(required("PILOT_BUDGET_USD")) > 0) || required("PILOT_PLAN") !== "Starter") throw new Error();
  const { createPineconePilot } = await import("../src/lib/memory/pineconePilot");
  const adapter = createPineconePilot({ host: required("PINECONE_PILOT_HOST"), apiKey: required("PINECONE_API_KEY"),
    namespace: "trustkaki-fictional-memory-pilot-calibration", embeddingEndpoint: required("EMBEDDING_ENDPOINT"),
    embeddingApiKey: "", embeddingModel: required("EMBEDDING_MODEL"), minimumScore: -1 });
  const records = pilotRecords.filter(r => r.status === "active" && (!r.expiresAt || r.expiresAt > retrievalEvaluationTime));
  const vectors: number[][] = [];
  for (let i = 0; i < records.length; i += 96) {
    vectors.push(...await adapter.embedBatch(records.slice(i, i + 96).map(r => r.content), AbortSignal.timeout(30000)));
    process.stderr.write(`Embedded calibration corpus: ${vectors.length}/${records.length}\n`);
  }
  const queries = await adapter.embedBatch(calibrationQuestions.map(q => q.query), AbortSignal.timeout(30000), "query");
  const positive: number[] = []; const forbidden: number[] = [];
  const observations = calibrationQuestions.map((q, i) => {
    const scores = records.map((r, j) => ({ id: r.id, score: cosine(queries[i], vectors[j]) }));
    const target = q.requiredKey ? scores.find(r => r.id === q.requiredKey)!.score : null;
    const irrelevant = Math.max(...scores.filter(r => q.requiredKey === null || r.id.startsWith("distractor-")).map(r => r.score));
    if (target !== null) positive.push(target); forbidden.push(irrelevant);
    return { id: q.id, targetScore: target, forbiddenMaximum: irrelevant };
  });
  const threshold = selectThreshold(positive, forbidden);
  process.stdout.write(JSON.stringify({ mode: "calibration", model: required("EMBEDDING_MODEL"),
    dataset: "fictional-memory-calibration-v1", corpusRecords: records.length, questions: queries.length,
    minimumPositive: Math.min(...positive), maximumForbidden: Math.max(...forbidden), threshold,
    passed: threshold !== null, usage: adapter.usage, indexWrites: 0,
    method: "exact local cosine; midpoint separating calibration positives and forbidden scores; final evaluation questions excluded",
    observations }, null, 2) + "\n");
  if (threshold === null) process.exitCode = 1;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(() => { process.stderr.write("Calibration failed; no provider details exposed. Check local configuration and service status.\n"); process.exitCode = 1; });
}
