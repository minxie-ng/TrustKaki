import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { z } from "zod";
import { TRIAGE_PROMPT, triageUserPrompt } from "../src/lib/agents/prompts";
import { triageOutputSchema } from "../src/lib/agents/schemas";
import { wholeFlowCases } from "./whole-flow-shadow-cases";
import { reserveRequest } from "./agent-comparison-budget";

const sourceHash = "4b52328e91abb64400c3b3bf4ed9d9976c2cb78e872708b58eac5091c2ddadc8";
const fields = new Set(["signals", "type", "category", "description", "severity", "riskLevel", "riskChange", "confidence", "routing", "summary", "responseMessage", "humanFollowUpRequired", "recommendedAction"]);

export async function diagnoseTriage(options: { directory: string; approved: boolean; request?: typeof fetch }) {
  const key = process.env.TRUSTKAKI_LLM_API_KEY?.trim();
  if (!options.approved || !key) throw new Error("diagnostic_approval_or_key_missing");
  const bytes = readFileSync(resolve(options.directory, "budget.json"));
  if (createHash("sha256").update(bytes).digest("hex") !== sourceHash) throw new Error("diagnostic_source_changed");
  const previous = JSON.parse(bytes.toString());
  const item = wholeFlowCases[0];
  const body = { model: "gpt-4o-mini-2024-07-18", messages: [
    { role: "system", content: TRIAGE_PROMPT }, { role: "user", content: triageUserPrompt(item.message, item.context) },
  ], temperature: 0.7, max_tokens: 1024, response_format: { type: "json_object" } };
  const budget = reserveRequest({ capMicroUsd: previous.capMicroUsd, reservedMicroUsd: previous.reservedMicroUsd, calls: previous.calls }, body);
  if (budget.calls !== 3) throw new Error("diagnostic_attempt_limit");
  const path = resolve(options.directory, "triage-diagnostic.json");
  const report = { ...budget, previousLedgerHash: sourceHash, runtimeBaseCommit: "79c3fd7", caseId: item.id,
    status: "reserved", schemaValid: false, successfulCostUsd: null as number | null,
    issues: [] as Array<{ code: string; path: Array<string | number> }> };
  // Exclusive persistent reservation prevents rerunning even after a crash or transport failure.
  writeFileSync(path, JSON.stringify(report, null, 2), { flag: "wx", mode: 0o600 });
  let stage = "transport";
  try {
    const response = await (options.request ?? fetch)("https://api.openai.com/v1/chat/completions", {
      method: "POST", redirect: "error", signal: AbortSignal.timeout(15000),
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + key }, body: JSON.stringify(body),
    });
    stage = "http_" + response.status;
    if (!response.ok) { await response.body?.cancel(); throw new Error(); }
    stage = "response_json";
    const data = await response.json();
    stage = "openai_envelope";
    const value = z.object({ model: z.literal(body.model),
      usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().min(0).max(1024) }),
      choices: z.array(z.object({ finish_reason: z.literal("stop"), message: z.object({ content: z.string().min(1) }) })).length(1),
    }).parse(data);
    const cost = (value.usage.prompt_tokens * 0.15 + value.usage.completion_tokens * 0.60) / 1_000_000;
    stage = "cost_bound";
    if (cost * 1_000_000 > budget.reservedMicroUsd - previous.reservedMicroUsd) throw new Error();
    report.successfulCostUsd = cost;
    stage = "agent_json";
    const parsed = triageOutputSchema.safeParse(JSON.parse(value.choices[0].message.content));
    report.schemaValid = parsed.success;
    if (!parsed.success) report.issues = parsed.error.issues.slice(0, 10).map(issue => ({ code: issue.code,
      path: issue.path.map(part => typeof part === "number" ? part : fields.has(String(part)) ? String(part) : "field") }));
    report.status = parsed.success ? "schema_valid" : "agent_schema";
  } catch { report.status = stage; }
  writeFileSync(path, JSON.stringify(report, null, 2), { mode: 0o600 });
  return report;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  if (process.argv.slice(2).join(" ") !== "--confirm-one-diagnostic") {
    console.error("Requires approval for one diagnostic request."); process.exitCode = 1;
  } else diagnoseTriage({ directory: resolve(".jev-active-routing-evaluation"), approved: true })
    .then(report => { console.log(JSON.stringify(report)); if (report.status !== "schema_valid") process.exitCode = 1; })
    .catch(() => { console.error("Diagnostic refused; no retry."); process.exitCode = 1; });
}
