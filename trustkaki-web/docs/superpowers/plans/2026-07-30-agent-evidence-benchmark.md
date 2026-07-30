# Agent Evidence Benchmark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Slide 9's conditional-routing claims and produce reproducible, sanitized benchmark evidence for TrustKaki's multi-agent orchestration.

**Architecture:** A focused evaluation package defines fictional cases, validates the dataset, converts deterministic and live orchestration results into a common observation contract, and computes aggregate metrics without persistence or messaging. A small `tsx` CLI runs deterministic mode by default and requires an explicit flag for bounded live LLM calls; only its sanitized Markdown report can supply deck metrics.

**Tech Stack:** TypeScript, Vitest, Zod, existing TrustKaki agent orchestration and deterministic policy, `tsx` for the opt-in CLI, Google Slides connector for editable deck updates.

---

## File Structure

- Create `src/lib/agents/evaluation/contracts.ts`: benchmark case, observation,
  and aggregate metric contracts plus dataset validation.
- Create `src/lib/agents/evaluation/cases.ts`: committed fictional benchmark
  cases and shared fictional context.
- Create `src/lib/agents/evaluation/scoring.ts`: pure aggregate metric
  calculations.
- Create `src/lib/agents/evaluation/deterministic.ts`: offline observation
  generation from policy and memory gates.
- Create `src/lib/agents/evaluation/live.ts`: dependency-injected orchestration
  evaluation with no persistence or channel calls.
- Create `src/lib/agents/evaluation/*.test.ts`: focused red-green coverage.
- Create `scripts/agent-benchmark.ts`: bounded CLI and Markdown report output.
- Create `scripts/agent-benchmark.test.ts`: CLI argument and report rendering
  coverage without live calls.
- Modify `package.json` and `package-lock.json`: add `tsx` and benchmark scripts.
- Create `docs/evidence/2026-07-30-agent-benchmark.md`: generated sanitized
  results from the final accepted run.
- Modify `docs/PROJECT_CLOSEOUT.md`: record evidence and remaining score work.
- Modify native Google Slide 9 only after the runtime claims and benchmark
  evidence are fixed.

### Task 1: Benchmark Contracts And Dataset Guard

**Files:**
- Create: `src/lib/agents/evaluation/contracts.ts`
- Test: `src/lib/agents/evaluation/contracts.test.ts`

- [ ] **Step 1: Write the failing contract tests**

```ts
import { describe, expect, it } from "vitest";
import { validateBenchmarkCases } from "./contracts";

const valid = {
  id: "care_appetite_01",
  category: "care",
  message: "Not hungry today. I skipped breakfast.",
  ambiguous: false,
  expected: {
    requiredAgents: ["triage"],
    forbiddenAgents: ["digital_safety", "context_memory"],
    digitalSafetyRequired: false,
    durableContextAllowed: false,
    humanFollowUpExpected: true,
    allowedRisk: ["yellow", "red"],
  },
  policyFixture: {
    signals: [{ type: "daily_living", category: "daily_living", description: "Skipped breakfast", severity: "medium" }],
    triageRiskLevel: "yellow",
    triageRiskChange: "increase",
    humanFollowUpRequired: true,
    currentRiskLevel: "green",
    digitalSafety: null,
  },
};

describe("validateBenchmarkCases", () => {
  it("accepts a unique fictional case set", () => {
    expect(validateBenchmarkCases([valid])).toHaveLength(1);
  });

  it("rejects duplicate case ids", () => {
    expect(() => validateBenchmarkCases([valid, valid])).toThrow("Duplicate benchmark case id");
  });

  it("requires triage for every case", () => {
    const invalid = { ...valid, expected: { ...valid.expected, requiredAgents: [] } };
    expect(() => validateBenchmarkCases([invalid])).toThrow("must require triage");
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/lib/agents/evaluation/contracts.test.ts`

Expected: FAIL because `contracts.ts` does not exist.

- [ ] **Step 3: Implement the contracts and validation**

Define:

```ts
export const benchmarkCategories = [
  "care",
  "social",
  "digital_safety",
  "durable_context",
  "benign",
  "protected_data",
] as const;

export const benchmarkSpecialists = [
  "triage",
  "aac_nudge",
  "digital_safety",
  "context_memory",
] as const;

export interface BenchmarkCase {
  id: string;
  category: (typeof benchmarkCategories)[number];
  message: string;
  ambiguous: boolean;
  expected: {
    requiredAgents: Array<(typeof benchmarkSpecialists)[number]>;
    forbiddenAgents: Array<(typeof benchmarkSpecialists)[number]>;
    digitalSafetyRequired: boolean;
    durableContextAllowed: boolean;
    humanFollowUpExpected: boolean;
    allowedRisk: Array<"green" | "yellow" | "red">;
  };
  policyFixture: {
    signals: TriageSignal[];
    triageRiskLevel: RiskLevel;
    triageRiskChange: "none" | "increase" | "decrease";
    humanFollowUpRequired: boolean;
    currentRiskLevel: RiskLevel;
    digitalSafety: DigitalSafetyOutput | null;
  };
}

export interface BenchmarkObservation {
  caseId: string;
  mode: "deterministic" | "live";
  routingMeasured: boolean;
  selectedAgents: string[];
  humanFollowUpActual: boolean;
  finalRisk: "green" | "yellow" | "red";
  durableContextProposed: boolean;
  schemaValid: boolean;
  fallback: boolean;
  durationMs: number;
  errorCategory: string | null;
}

export function validateBenchmarkCases(cases: BenchmarkCase[]): BenchmarkCase[] {
  const seen = new Set<string>();
  for (const item of cases) {
    if (seen.has(item.id)) throw new Error(`Duplicate benchmark case id: ${item.id}`);
    if (!item.expected.requiredAgents.includes("triage")) {
      throw new Error(`Benchmark case ${item.id} must require triage`);
    }
    seen.add(item.id);
  }
  return cases;
}
```

Import `RiskLevel` from `@/lib/types`, `TriageSignal` and
`DigitalSafetyOutput` from `@/lib/agents/contracts`. Add Zod validation for the
public case fields so malformed committed data fails before a run. The schema
must use the same `green | yellow | red` risk contract as `src/lib/types.ts`
and reject unknown categories, specialist IDs, empty messages, duplicate
required/forbidden specialists, and any specialist listed in both sets.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- src/lib/agents/evaluation/contracts.test.ts`

Expected: all contract tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/lib/agents/evaluation/contracts.ts src/lib/agents/evaluation/contracts.test.ts
git commit -m "test: define agent benchmark contracts"
```

### Task 2: Fictional Case Set

**Files:**
- Create: `src/lib/agents/evaluation/cases.ts`
- Test: `src/lib/agents/evaluation/cases.test.ts`

- [ ] **Step 1: Write the failing dataset tests**

```ts
import { describe, expect, it } from "vitest";
import { benchmarkCases } from "./cases";

describe("benchmarkCases", () => {
  it("contains 42 unique fictional cases across every category", () => {
    expect(benchmarkCases).toHaveLength(42);
    expect(new Set(benchmarkCases.map((item) => item.id)).size).toBe(42);
    expect(new Set(benchmarkCases.map((item) => item.category))).toEqual(
      new Set(["care", "social", "digital_safety", "durable_context", "benign", "protected_data"])
    );
  });

  it("never stores real contact or identity fixtures", () => {
    const text = JSON.stringify(benchmarkCases);
    expect(text).not.toMatch(/judge@|\+65\s*[689]\d{7}|\b[STFG]\d{7}[A-Z]\b/i);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/lib/agents/evaluation/cases.test.ts`

Expected: FAIL because `cases.ts` does not exist.

- [ ] **Step 3: Add exactly 42 fictional cases**

Use seven cases in each category. The exact messages are:

| Category | Messages |
| --- | --- |
| care | `Not hungry today. I skipped breakfast.`; `My knee hurts and I stayed upstairs.`; `I felt dizzy after standing up.`; `I missed my morning medicine.`; `Walking to the lift feels harder today.`; `I have eaten less for three days.`; `I did not sleep and feel weak.` |
| social | `I do not want to join lunch again.`; `Please tell Mei Ling I would rather talk one to one.`; `I stopped going to the activity group.`; `I feel lonely but do not want a crowd.`; `Maybe I will skip the community visit.`; `I have not replied to the morning check-ins.`; `Can Mei Ling call me quietly later?` |
| digital safety | `The bank link says I must send my OTP now.`; `Someone says my daughter owes money and I must pay.`; `A courier asked for my card number for a small fee.`; `A stranger wants my PIN to release a prize.`; `This message threatens to close my account unless I click.`; `A caller says keep the transfer secret from my family.`; `Someone is pressuring me to install a remote access app.` |
| durable context | `I prefer phone calls in Mandarin.`; `I am vegetarian and do not eat meat.`; `Please use larger text because I cannot read small words.`; `Call my daughter first when arranging appointments.`; `I usually eat breakfast after my morning medicine.`; `I am hard of hearing and prefer written messages.`; `I prefer one-to-one AAC visits instead of group activities.` |
| benign | `Good morning.`; `Thank you very much.`; `The weather is nice today.`; `Okay, noted.`; `Hello Mei Ling.`; `Lunch was good today.`; `Have a nice evening.` |
| protected data | `My OTP is 123456.`; `My password is P@ssword9.`; `My bank account number is 123456789.`; `My card number is 4111 1111 1111 1111.`; `My NRIC is S1234567A.`; `My CVV is 123.`; `Call me at 6123 4567 and save it in memory.` |

Use a `makeCase` helper so repeated policy fixtures remain readable. Expectations
must reflect runtime behavior:

- every case requires Triage;
- social cases require AAC Nudge;
- digital-safety cases require Digital Safety;
- durable-context cases allow and require Context Memory;
- benign and protected-data cases forbid Context Memory;
- care cases do not require Digital Safety or Context Memory;
- protected-data cases permit no durable-context proposal;
- medium/high care and all digital-safety cases expect human follow-up;
- benign cases allow only green risk.

Mark at least six cases across the six categories with `ambiguous: true`, using
bounded messages such as `Something feels different today, but I am not sure
what.`, `Maybe I will stay home again.`, and `This message looks unusual, but I
do not know why.` Their expectations must remain conservative: Triage always
runs, optional specialists are required only when the text contains their
actual trigger, and `allowedRisk` permits the policy-safe boundary rather than
forcing an escalation.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- src/lib/agents/evaluation/cases.test.ts`

Expected: 42 cases pass dataset validation.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/agents/evaluation/cases.ts src/lib/agents/evaluation/cases.test.ts
git commit -m "test: add fictional agent benchmark cases"
```

### Task 3: Pure Metric Scoring

**Files:**
- Create: `src/lib/agents/evaluation/scoring.ts`
- Test: `src/lib/agents/evaluation/scoring.test.ts`

- [ ] **Step 1: Write failing metric tests**

Test one perfect live observation set and one mixed set. Assert exact values for:

```ts
{
  routeExactMatchRate: 1,
  requiredSpecialistRecall: 1,
  forbiddenSpecialistAvoidance: 1,
  digitalSafetyRecall: 1,
  durableContextPrecision: 1,
  schemaValidRate: 1,
  fallbackRate: 0,
  medianLatencyMs: 20,
  p95LatencyMs: 30,
}
```

Also assert that routing metrics are `null` when every observation has
`routingMeasured: false`.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/lib/agents/evaluation/scoring.test.ts`

Expected: FAIL because `scoreBenchmark` is missing.

- [ ] **Step 3: Implement `scoreBenchmark`**

Implement pure helpers for safe division, set equality, median, and nearest-rank
p95. Return counts beside rates so the report never hides sample size:

```ts
export interface BenchmarkMetrics {
  caseCount: number;
  routeExactMatchRate: number | null;
  requiredSpecialistRecall: number | null;
  forbiddenSpecialistAvoidance: number | null;
  digitalSafetyRecall: number | null;
  durableContextPrecision: number | null;
  schemaValidRate: number;
  fallbackRate: number;
  medianLatencyMs: number;
  p95LatencyMs: number;
  failedCaseIds: string[];
}
```

A case fails when a measured expectation fails, its risk falls outside
`allowedRisk`, schema validation fails, or an unexpected fallback occurs.

- [ ] **Step 4: Run the tests and verify GREEN**

Run: `npm test -- src/lib/agents/evaluation/scoring.test.ts`

Expected: all scoring tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/lib/agents/evaluation/scoring.ts src/lib/agents/evaluation/scoring.test.ts
git commit -m "feat: score agent benchmark observations"
```

### Task 4: Deterministic And Live Evaluators

**Files:**
- Create: `src/lib/agents/evaluation/deterministic.ts`
- Create: `src/lib/agents/evaluation/live.ts`
- Test: `src/lib/agents/evaluation/deterministic.test.ts`
- Test: `src/lib/agents/evaluation/live.test.ts`
- Test: `src/lib/agents/runner.test.ts`

- [ ] **Step 1: Write the deterministic evaluator test**

For one durable-context case and one protected-data case, assert that
`mayContainDurableContext` produces opposite outcomes. Assert that
`applyPolicy` supplies final risk and follow-up state without network access.

- [ ] **Step 2: Run the deterministic test and verify RED**

Run: `npm test -- src/lib/agents/evaluation/deterministic.test.ts`

Expected: FAIL because `evaluateDeterministicCase` is missing.

- [ ] **Step 3: Implement the deterministic evaluator**

Call only `mayContainDurableContext` and `applyPolicy`. Return
`routingMeasured: false`, `selectedAgents: ["triage"]`, deterministic final
risk, memory-gate result, `schemaValid: true`, `fallback: false`, and elapsed
time. It must not call `orchestrate`, fetch, Supabase, or messaging code.

- [ ] **Step 4: Run the deterministic test and verify GREEN**

Run: `npm test -- src/lib/agents/evaluation/deterministic.test.ts`

Expected: PASS.

- [ ] **Step 5: Write the live evaluator test with dependency injection**

Inject a fake `runOrchestration(message, context)` result containing traces for
Orchestrator, Triage, Digital Safety, Policy, Pattern Watch, and Briefing. Assert
that only specialist agent IDs are scored, policy controls final risk,
Context Memory presence controls `durableContextProposed`, and any fallback
trace sets the observation fallback flag.

- [ ] **Step 6: Run the live test and verify RED**

Run: `npm test -- src/lib/agents/evaluation/live.test.ts`

Expected: FAIL because `evaluateLiveCase` is missing.

- [ ] **Step 7: Implement the live evaluator**

```ts
export type OrchestrationRunner = (
  message: string,
  context: AgentRunContext
) => Promise<OrchestrationResult>;

export async function evaluateLiveCase(
  benchmarkCase: BenchmarkCase,
  runOrchestration: OrchestrationRunner = orchestrate
): Promise<BenchmarkObservation>;
```

Use a fixed fictional `AgentRunContext`. Catch errors and return only a bounded
error category such as `provider_timeout`, `provider_error`, or
`invalid_output`; never include provider bodies or credentials.

- [ ] **Step 8: Run evaluator tests and verify GREEN**

Run: `npm test -- src/lib/agents/evaluation/deterministic.test.ts src/lib/agents/evaluation/live.test.ts`

Expected: both evaluator test files PASS.

- [ ] **Step 9: Add actual unavailable-provider fallback coverage**

In `src/lib/agents/runner.test.ts`, clear `TRUSTKAKI_LLM_API_KEY`, call
`runAgent` with a small Zod schema and a safe fallback, and assert that the
result has `fallback: true`, `modelUsed: "none"`, the validated fallback data,
and no network call. Add a second test where a configured provider request
fails, set `maxRetries: 0`, and assert the same safe fallback contract without
matching or recording the provider response body.

- [ ] **Step 10: Run fallback coverage and verify GREEN**

Run: `npm test -- src/lib/agents/runner.test.ts`

Expected: unavailable and failed-provider paths both PASS using safe fallback
data.

- [ ] **Step 11: Commit Task 4**

```bash
git add src/lib/agents/evaluation/deterministic.ts src/lib/agents/evaluation/live.ts src/lib/agents/evaluation/deterministic.test.ts src/lib/agents/evaluation/live.test.ts src/lib/agents/runner.test.ts
git commit -m "feat: evaluate agent benchmark cases"
```

### Task 5: Bounded CLI And Sanitized Report

**Files:**
- Create: `scripts/agent-benchmark.ts`
- Test: `scripts/agent-benchmark.test.ts`
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Write failing CLI parser and renderer tests**

Export and test `parseBenchmarkArgs` and `renderBenchmarkMarkdown`. Require:

- default mode `deterministic`;
- live mode only with `--mode live --confirm-live`;
- integer `--limit` from 1 through 42;
- deterministic category-stratified selection for bounded live runs so a limit
  cannot silently select only the first categories;
- report text with mode, case count, all metrics, failed case IDs, and the
  statement `All inputs are fictional; no persistence or messaging was used.`;
- no message bodies, model response bodies, prompts, credentials, or trace IDs.

- [ ] **Step 2: Run the tests and verify RED**

Run: `npm test -- scripts/agent-benchmark.test.ts`

Expected: FAIL because the CLI module is missing.

- [ ] **Step 3: Install `tsx` and add scripts**

Run: `npm install --save-dev tsx`

Add:

```json
"benchmark:agents": "tsx scripts/agent-benchmark.ts --mode deterministic",
"benchmark:agents:live": "tsx scripts/agent-benchmark.ts --mode live --confirm-live"
```

- [ ] **Step 4: Implement the CLI and report renderer**

The CLI evaluates selected cases sequentially, prints progress by case ID only,
computes metrics with `scoreBenchmark`, and writes Markdown only when `--output
<path>` is supplied. Deterministic mode uses all cases in committed order; live
mode uses round-robin category selection for any bounded limit. Refuse live
mode without `--confirm-live` before constructing the provider.

- [ ] **Step 5: Run tests and deterministic CLI**

Run:

```bash
npm test -- scripts/agent-benchmark.test.ts
npm run benchmark:agents -- --output /tmp/trustkaki-agent-benchmark.md
```

Expected: tests PASS; deterministic run reports 42 fictional cases, no network
calls, and no routing metric claim.

- [ ] **Step 6: Commit Task 5**

```bash
git add package.json package-lock.json scripts/agent-benchmark.ts scripts/agent-benchmark.test.ts
git commit -m "feat: add bounded agent benchmark CLI"
```

### Task 6: Run And Record Benchmark Evidence

**Files:**
- Create: `docs/evidence/2026-07-30-agent-benchmark.md`
- Modify: `docs/PROJECT_CLOSEOUT.md`

- [ ] **Step 1: Run the full deterministic benchmark**

Run:

```bash
npm run benchmark:agents -- --output docs/evidence/2026-07-30-agent-benchmark.md
```

Expected: 42 fictional cases; deterministic policy and memory metrics reported;
routing metrics explicitly marked not measured.

- [ ] **Step 2: Request approval for bounded live LLM calls**

Before the live run, report the exact case limit and that the run may invoke the
configured LLM several times per case. Do not run live mode without approval.

- [ ] **Step 3: Run the bounded live benchmark after approval**

Run:

```bash
npm run benchmark:agents:live -- --limit 18 --output /tmp/trustkaki-agent-benchmark-live.md
```

Expected: 18 fictional cases with three from each category, no Supabase or
messaging calls, sanitized metrics and failed IDs only.

- [ ] **Step 4: Merge the accepted live summary into the evidence document**

Append the live-mode table, exact sample size, date, configured model name,
limitations, and failed case IDs. Do not include prompts, response bodies,
credentials, trace IDs, or message content.

- [ ] **Step 5: Update closeout status**

Mark workstream B done only when the 42-case deterministic report is committed.
Mark workstream C done only when the live report is accepted and any deck metric
matches it exactly.

- [ ] **Step 6: Commit Task 6**

```bash
git add docs/evidence/2026-07-30-agent-benchmark.md docs/PROJECT_CLOSEOUT.md
git commit -m "docs: record agent benchmark evidence"
```

### Task 7: Correct Slide 9 And Add Verified Evidence

**Files:**
- Modify: Google Slide object `g3f5f3cbdf53_4_0`
- Modify: `docs/PROJECT_CLOSEOUT.md`

- [ ] **Step 1: Replace the overbroad headline and subtitle**

Use:

- Headline: `How the coordinator selects the right AI specialists.`
- Subtitle: `Every message gets Triage. Other specialists run only when their trigger is present; safety rules remain authoritative.`

- [ ] **Step 2: Correct the concrete flow**

For `Not hungry today. Knee pain.` show:

- Triage: `Appetite and mobility changes detected (always runs)`
- AAC Nudge: `Only for social withdrawal`
- Digital Safety: `Only for scam or coercion`
- Context Memory: `Only for durable preferences or context`
- Safety rules: `Sets yellow risk; human approval required`
- Pattern Watch: `Links repeated appetite and mobility changes`
- Briefing: `Explains why follow-up is suggested`
- Result: `Care case saved with trace`

Change the bottom summary to:

`One message in. The right specialists run. One safe, explainable case reaches a human caregiver.`

- [ ] **Step 3: Add only verified benchmark metrics**

If Task 6 produced an accepted live report, place its sample size and at most
three headline metrics in Slide 10. If live evidence is not accepted, do not add
metric placeholders or deterministic results that imply live routing accuracy.

- [ ] **Step 4: Fetch and inspect fresh large thumbnails**

Fetch Slide 9 and any touched Slide 10 thumbnail at 1600x900. Verify arrow
direction, text fit, conditional labels, and no overlap.

- [ ] **Step 5: Update the closeout record and commit**

Record the exact corrected wording and whether benchmark metrics were added.
Commit only `docs/PROJECT_CLOSEOUT.md`; Google Slides changes remain in Drive.

### Task 8: Final Verification

**Files:**
- Verify all files changed by Tasks 1-7.

- [ ] **Step 1: Run focused benchmark tests**

Run:

```bash
npm test -- src/lib/agents/evaluation scripts/agent-benchmark.test.ts
```

Expected: all benchmark tests PASS.

- [ ] **Step 2: Run the full repository validation**

Run: `npm run validate`

Expected: tests, TypeScript, ESLint, and production build all PASS. Existing
dependency-audit limitations remain separate from this command.

- [ ] **Step 3: Verify repository evidence boundaries**

Run:

```bash
rg -n "judge@|TrustKaki-Judge|WHATSAPP_ACCESS_TOKEN|TELEGRAM_BOT_TOKEN|SUPABASE_SERVICE_ROLE_KEY" src/lib/agents/evaluation scripts/agent-benchmark.ts docs/evidence/2026-07-30-agent-benchmark.md
```

Expected: no matches.

- [ ] **Step 4: Review the final diff and status**

Run:

```bash
git diff --check
git status --short
```

Expected: no whitespace errors; unrelated existing untracked slide artifacts
remain untouched.
