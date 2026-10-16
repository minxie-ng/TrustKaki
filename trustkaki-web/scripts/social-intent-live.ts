import { createHash } from "node:crypto";
import { appendFileSync, closeSync, existsSync, mkdirSync, openSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { buildJevSocialIntentRequest, OPENROUTER_JEV_ENDPOINT, parseJevSocialIntent, scoreSocialIntent, socialIntentCases, socialIntentLabels, type SocialIntent } from "../src/lib/agents/evaluation/socialIntent";
import type { ComparisonBudget } from "./agent-comparison-budget";
import { reserveSocialIntentRequest } from "./social-intent-budget";

type Provider = "jev" | "openai";
interface Ledger extends ComparisonBudget { datasetSha256: string; inFlight: string | null; stopped: boolean; jevModel: string | null; failureCode?: string; reviewedFailure?: { key: string; originalStatus: string; approvedAt: string } }
interface Observation { provider: Provider; caseId: string; label: SocialIntent; model: string; durationMs: number; costUsd: number; confidence?: number; probabilities?: Record<SocialIntent, number> }
const inputSchema = z.object({ label: z.enum(socialIntentLabels) }).strict();
const openaiSchema = z.object({
  model: z.literal("gpt-4o-mini-2024-07-18"),
  choices: z.array(z.object({ message: z.object({ content: z.string() }), finish_reason: z.literal("stop") })).length(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().min(0).max(128) }),
});

export async function runSocialIntentPilot(options: {
  directory: string; approvedCapUsd: number; openrouterKey: string; openaiKey: string;
  request?: typeof fetch;
  approvedFormatRecovery?: boolean;
}) {
  if (options.approvedCapUsd !== 1 || !options.openrouterKey.trim() || !options.openaiKey.trim()) throw new Error("social_intent_approval_or_keys_missing");
  const request = options.request ?? fetch;
  const hash = createHash("sha256").update(JSON.stringify(socialIntentCases)).digest("hex");
  mkdirSync(options.directory, { recursive: true, mode: 0o700 });
  const lockPath = resolve(options.directory, "run.lock");
  const lock = openSync(lockPath, "wx", 0o600); // A stale lock requires inspection, not automatic takeover.
  const budgetPath = resolve(options.directory, "budget.json");
  const resultsPath = resolve(options.directory, "observations.jsonl");
  const save = (ledger: Ledger) => {
    writeFileSync(budgetPath + ".tmp", JSON.stringify(ledger), { mode: 0o600 });
    renameSync(budgetPath + ".tmp", budgetPath);
  };
  try {
    let ledger: Ledger = existsSync(budgetPath) ? JSON.parse(readFileSync(budgetPath, "utf8")) : {
      capMicroUsd: 1_000_000, reservedMicroUsd: 0, calls: 0, datasetSha256: hash, inFlight: null, stopped: false, jevModel: null,
    };
    const observations: Observation[] = existsSync(resultsPath) ? readFileSync(resultsPath, "utf8").trim().split("\n").filter(Boolean).map(s => JSON.parse(s)) : [];
    if (ledger.datasetSha256 !== hash || ledger.capMicroUsd !== 1_000_000) throw new Error("social_intent_ledger_requires_review");
    if (options.approvedFormatRecovery && !ledger.reviewedFailure) {
      if (!ledger.stopped || ledger.inFlight !== "openai:social_intent_1_1" || ledger.calls !== 2 ||
          ledger.reservedMicroUsd !== 11563 || observations.length !== 1 ||
          observations[0].provider !== "jev" || observations[0].caseId !== "social_intent_1_1") throw new Error("social_intent_recovery_scope_mismatch");
      writeFileSync(resolve(options.directory, "before-approved-format-recovery.json"), JSON.stringify(ledger), { mode: 0o600, flag: "wx" });
      ledger.reviewedFailure = { key: ledger.inFlight, originalStatus: ledger.failureCode ?? "unknown_original_error", approvedAt: new Date().toISOString() };
      ledger.inFlight = null;
      ledger.stopped = false;
      delete ledger.failureCode;
      save(ledger); // Preserve both original reservations and the failed-attempt count.
    }
    if (ledger.inFlight !== null || ledger.stopped) throw new Error("social_intent_ledger_requires_review");
    if (observations.length + (ledger.reviewedFailure ? 1 : 0) !== ledger.calls) throw new Error("social_intent_ledger_results_mismatch");
    const done = new Set(observations.map(o => o.provider + ":" + o.caseId));
    if (done.size !== observations.length) throw new Error("social_intent_duplicate_result");
    save(ledger);
    for (const item of socialIntentCases) {
      for (const provider of ["jev", "openai"] as const) {
        const key = provider + ":" + item.id;
        if (done.has(key)) continue;
        const jev = { ...buildJevSocialIntentRequest(item.message), model: "typesafe/jev-1.14" };
        const body = provider === "jev" ? jev : {
          model: "gpt-4o-mini-2024-07-18", temperature: 0, max_tokens: 128, response_format: { type: "json_object" },
          messages: [
            { role: "system", content: jev.questions.social_intent.instructions + "\nLabel criteria: " + JSON.stringify(jev.questions.social_intent.criteria) + '\nReturn only a JSON object {"label":"interested|declining|unclear"}, choosing exactly one label.' },
            { role: "user", content: JSON.stringify(jev.state) },
          ],
        };
        const previousReservation = ledger.reservedMicroUsd;
        ledger = { ...ledger, ...reserveSocialIntentRequest(ledger, provider, body, ledger.reviewedFailure ? 73 : 72), inFlight: key };
        save(ledger); // Durable reservation BEFORE sending; failures never refund or retry.
        const started = performance.now();
        let failureCode = "provider_transport_error";
        try {
          const response = await request(provider === "jev" ? OPENROUTER_JEV_ENDPOINT : "https://api.openai.com/v1/chat/completions", {
            method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
            headers: { "Content-Type": "application/json", Authorization: "Bearer " + (provider === "jev" ? options.openrouterKey : options.openaiKey) },
            body: JSON.stringify(body),
          });
          if (!response.ok) { failureCode = "provider_http_" + response.status; await response.body?.cancel(); throw new Error(failureCode); }
          failureCode = "invalid_provider_response";
          const json: unknown = await response.json();
          let observation: Observation;
          if (provider === "jev") {
            const parsed = parseJevSocialIntent(json);
            if (!/^typesafe\/jev-1\.14(?:[-.]\d+)*$/.test(parsed.model) || parsed.usage.cost === undefined ||
                parsed.usage.input_tokens > 262144 || (ledger.jevModel !== null && ledger.jevModel !== parsed.model)) throw new Error("unverified_jev_model_or_usage");
            ledger.jevModel = parsed.model;
            observation = { provider, caseId: item.id, label: parsed.label, model: parsed.model,
              durationMs: performance.now() - started, costUsd: parsed.usage.cost,
              confidence: parsed.confidence, probabilities: parsed.probabilities };
          } else {
            const parsed = openaiSchema.parse(json);
            const label = inputSchema.parse(JSON.parse(parsed.choices[0].message.content)).label;
            observation = { provider, caseId: item.id, label, model: parsed.model, durationMs: performance.now() - started,
              costUsd: (parsed.usage.prompt_tokens * 0.15 + parsed.usage.completion_tokens * 0.60) / 1_000_000 };
          }
          if (observation.costUsd * 1_000_000 > ledger.reservedMicroUsd - previousReservation) throw new Error("reported_cost_exceeds_reservation");
          appendFileSync(resultsPath, JSON.stringify(observation) + "\n", { mode: 0o600 });
          observations.push(observation);
          ledger.inFlight = null;
          save(ledger);
          console.log(`PASS ${provider} ${item.id}`);
        } catch {
          ledger.stopped = true;
          ledger.failureCode = failureCode;
          save(ledger);
          throw new Error("social_intent_stopped_at_" + key); // No provider bodies or credentials in errors.
        }
      }
    }
    const summaries = (["jev", "openai"] as const).flatMap(provider => (["development", "held_out"] as const).map(split => {
      const cases = socialIntentCases.filter(c => c.split === split);
      const rows = cases.map(c => observations.find(o => o.provider === provider && o.caseId === c.id)!);
      const durations = rows.map(r => r.durationMs).sort((a, b) => a - b);
      const byLanguage = (["English", "Mandarin", "Singlish"] as const).map(language => {
        const subset = cases.filter(c => c.language === language);
        return { language, ...scoreSocialIntent(subset, subset.map(c => rows.find(r => r.caseId === c.id)!.label)) };
      });
      return { provider, split, ...scoreSocialIntent(cases, rows.map(r => r.label)), byLanguage,
        costUsd: rows.reduce((sum, r) => sum + r.costUsd, 0), p95Ms: durations[Math.ceil(durations.length * 0.95) - 1] };
    }));
    const report = { datasetSha256: hash, reservedUsd: ledger.reservedMicroUsd / 1_000_000,
      calls: ledger.calls, successfulCalls: observations.length, reviewedFailure: ledger.reviewedFailure ?? null,
      estimatedOrReportedCostUsd: observations.reduce((s, o) => s + o.costUsd, 0), summaries };
    writeFileSync(resolve(options.directory, "summary.json"), JSON.stringify(report, null, 2));
    return report;
  } finally { closeSync(lock); unlinkSync(lockPath); }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const args = process.argv.slice(2).join(" ");
  if (!["--confirm-live --cap-usd=1", "--confirm-live --cap-usd=1 --approved-format-recovery"].includes(args)) {
    console.error("Requires separate owner approval, configured keys, and --confirm-live --cap-usd=1"); process.exitCode = 1;
  } else {
    runSocialIntentPilot({ directory: resolve(process.cwd(), ".jev-evaluation"), approvedCapUsd: 1,
      openrouterKey: process.env.OPENROUTER_API_KEY ?? "", openaiKey: process.env.TRUSTKAKI_LLM_API_KEY ?? "",
      approvedFormatRecovery: args.endsWith(" --approved-format-recovery") })
      .then(report => console.log(JSON.stringify(report, null, 2)))
      .catch(() => { console.error("Evaluation stopped; inspect the persistent ledger without resetting it."); process.exitCode = 1; });
  }
}
