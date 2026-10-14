import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { setTimeout as delay } from "node:timers/promises";
import {
  retrievalDatasetVersion, retrievalGuardCases, pilotQuestions, pilotRecords,
  retrievalEvaluationScope as scope, retrievalEvaluationTime as now,
} from "../src/lib/agents/evaluation/memoryRetrievalCases";
import { retrievePersonalMemory } from "../src/lib/memory/retrieval";
import { createPineconePilot } from "../src/lib/memory/pineconePilot";

class PilotConfigurationError extends Error {}
export async function runMemoryEvaluation(
  args: string[], env: Record<string, string | undefined>, create: typeof createPineconePilot = createPineconePilot
) {
  const mode = args.length ? args[1] : "deterministic";
  const valid = !args.length || (args[0] === "--mode" && (
    (mode === "deterministic" && args.length === 2) ||
    (mode === "live" && args.slice(2).every(a => ["--confirm-live", "--confirm-provider-budget"].includes(a))
      && new Set(args).size === args.length)));
  if (!valid) throw new PilotConfigurationError("Invalid memory evaluation arguments");
  if (mode === "deterministic") {
    if (args.some(a => a.startsWith("--confirm"))) throw new PilotConfigurationError("Confirmation flags require live mode");
    const observations = [];
    for (const c of retrievalGuardCases) {
      const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query: c.message, now }, {
        embeddingModel: "labelled-test-ranks", indexEmbeddingModel: "labelled-test-ranks", minimumScore: 0.3,
        resolveScope: async () => scope, embed: async () => [1],
        search: async () => c.records.map(r => ({ ...r, sourceVersion: r.version, indexVersion: r.version,
          embeddingModel: "labelled-test-ranks", score: c.requiredKeys.includes(r.contextKey) ? 1 : 0.5 })),
        fetchSources: async (_, ids) => c.records.filter(r => ids.includes(r.id)),
      });
      const keys = result.items.map(r => r.contextKey);
      observations.push({ id: c.id, pass: result.reason === null && c.requiredKeys.every(k => keys.includes(k))
        && c.forbiddenKeys.every(k => !keys.includes(k)), selectedCount: keys.length });
    }
    return { mode, dataset: retrievalDatasetVersion, semanticQualityMeasured: false,
      generationMeasured: false, passed: observations.filter(r => r.pass).length, total: observations.length,
      passedGate: observations.every(r => r.pass), observations };
  }
  if (!args.includes("--confirm-live") || !args.includes("--confirm-provider-budget")) {
    throw new PilotConfigurationError("Live mode requires fictional-upload and provider-budget confirmations");
  }
  const required = (key: string) => {
    const value = env[key]?.trim();
    if (!value) throw new PilotConfigurationError("Missing pilot configuration; see PERSONAL_MEMORY_RAG_GUIDE.md");
    return value;
  };
  const budgetUsd = Number(required("TRUSTKAKI_MEMORY_PILOT_BUDGET_USD"));
  const minimumScore = Number(required("TRUSTKAKI_MEMORY_PILOT_MIN_SCORE"));
  if (!(budgetUsd > 0 && Number.isFinite(budgetUsd)) || !Number.isFinite(minimumScore) || minimumScore < -1 || minimumScore > 1) {
    throw new PilotConfigurationError("Invalid pilot budget or cosine score threshold");
  }
  const region = required("TRUSTKAKI_MEMORY_PILOT_REGION");
  const plan = required("TRUSTKAKI_MEMORY_PILOT_PLAN");
  const embeddingModel = required("TRUSTKAKI_MEMORY_EMBEDDING_MODEL");
  const namespace = `trustkaki-fictional-memory-pilot-${randomUUID()}`;
  const adapter = create({
    host: required("TRUSTKAKI_MEMORY_PINECONE_PILOT_HOST"), apiKey: required("TRUSTKAKI_MEMORY_PINECONE_API_KEY"), namespace,
    embeddingEndpoint: required("TRUSTKAKI_MEMORY_EMBEDDING_ENDPOINT"), embeddingApiKey: required("TRUSTKAKI_MEMORY_EMBEDDING_API_KEY"),
    embeddingModel, minimumScore,
  });
  process.stderr.write(JSON.stringify({ event: "fictional_pilot_started", namespace }) + "\n");
  let dimensions = 0;
  for (let i = 0; i < pilotRecords.length; i += 100) {
    const batch = pilotRecords.slice(i, i + 100);
    const vectors = await adapter.embedBatch(batch.map(r => r.content), AbortSignal.timeout(30000));
    if (dimensions && vectors[0].length !== dimensions) throw new Error("Embedding dimensions changed");
    dimensions = vectors[0].length;
    const state = await adapter.indexState(AbortSignal.timeout(10000));
    if (state.dimension !== dimensions) throw new Error("Index embedding dimensions differ");
    await adapter.upsert(batch, vectors, AbortSignal.timeout(30000));
  }
  let ready = false;
  const readinessStarted = Date.now();
  for (let attempt = 0; attempt < 30 && Date.now() - readinessStarted < 60000; attempt++) {
    if ((await adapter.indexState(AbortSignal.timeout(2000))).count === pilotRecords.length) { ready = true; break; }
    await delay(1000);
  }
  if (!ready) throw new Error("Fictional index readiness unconfirmed");
  const sourceById = new Map(pilotRecords.map(r => [r.id, r]));
  const observations: Array<{ id: string; language: string; pass: boolean; unavailable: boolean; elapsedMs: number; forbidden: number }> = [];
  for (const q of pilotQuestions) {
    const result = await retrievePersonalMemory({ seniorId: scope.seniorId, query: q.query, now }, {
      embeddingModel, indexEmbeddingModel: embeddingModel, minimumScore,
      resolveScope: async seniorId => seniorId === scope.seniorId ? scope : null,
      embed: adapter.embed, search: adapter.search,
      fetchSources: async (_, ids) => ids.flatMap(id => sourceById.has(id) ? [sourceById.get(id)!] : []),
    });
    const keys = result.items.map(r => r.contextKey);
    observations.push({ id: q.id, language: q.language, pass: q.requiredKeys.every(k => keys.includes(k)),
      unavailable: result.status === "unavailable", elapsedMs: result.diagnostics.elapsedMs,
      forbidden: keys.filter(key => q.forbiddenKeys.includes(key)).length });
  }
  const languages = ["English", "Mandarin", "Singlish"].map(language => {
    const rows = observations.filter(r => r.language === language);
    return { language, queries: rows.length, recallAt6: rows.filter(r => r.pass).length / rows.length };
  });
  const durations = observations.map(r => r.elapsedMs).sort((a, b) => a - b);
  const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
  return { mode, dataset: retrievalDatasetVersion, namespace, semanticQualityMeasured: true, generationMeasured: false,
    embeddingModel, apiVersion: "2026-07", declaredRegion: region, declaredPlan: plan, declaredAccountBudgetUsd: budgetUsd,
    budgetEnforcedByScript: false, sourceStore: "local fictional fixtures; not production durable storage",
    records: pilotRecords.length, languages, p95Ms, usage: adapter.usage,
    unavailableQueries: observations.filter(r => r.unavailable).length,
    forbiddenFacts: observations.reduce((sum, r) => sum + r.forbidden, 0),
    passedGate: languages.every(r => r.recallAt6 >= 0.9) && p95Ms <= 1500 && observations.every(r => !r.unavailable && !r.forbidden)
      && observations.filter(r => r.id.startsWith("gardening-") || r.id.startsWith("contact-")).every(r => r.pass),
    observations, lifecycleGate: "unrun against live provider; local guards tested separately",
    dollarCost: "unmeasured; reconcile usage with provider billing; account cap required",
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runMemoryEvaluation(process.argv.slice(2), process.env).then(report => {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    if (!report.passedGate) process.exitCode = 1;
  }).catch(error => {
    process.stderr.write((error instanceof PilotConfigurationError ? error.message : "Memory pilot failed; provider details withheld. Check configuration and index readiness.") + "\n");
    process.exitCode = 1;
  });
}
