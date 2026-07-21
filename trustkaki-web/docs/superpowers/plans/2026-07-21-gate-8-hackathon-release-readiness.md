# Gate 8 Hackathon Release Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Produce a tested, observable, reversible TrustKaki hackathon release without claiming real AAC pilot readiness.

**Architecture:** Preserve the existing Vercel, Supabase, Telegram, WhatsApp, and deterministic-policy boundaries. Add only sanitized health metadata, a public non-mutating smoke CLI, complete route hardening, and one operational runbook; keep all deployment, webhook, retry, and outbound operations behind explicit approval checkpoints.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Vitest, Node.js built-in `fetch`, Vercel, Supabase.

---

## File Map

- `src/app/api/health/route.ts`: public boolean-only release readiness.
- `src/app/api/health/route.test.ts`: health status and leakage regression tests.
- `scripts/release-smoke.mjs`: credential-free public deployment smoke command.
- `scripts/release-smoke.test.ts`: subprocess and local-server smoke tests.
- `package.json`: exposes `npm run release:smoke -- "$TRUSTKAKI_RELEASE_URL"`.
- `src/app/api/deployment-hardening.test.ts`: discovers every API route and every client module rather than maintaining stale lists.
- Five existing admin route files: explicitly declare the Node.js runtime.
- `docs/operations/HACKATHON_RELEASE_RUNBOOK.md`: deployment, rollback, incident, judge, transport, and go/no-go source of truth.
- `README.md`: points to the smoke command and removes stale Telegram evidence.
- `docs/TrustKaki_BUILD_ROADMAP.md`: records Gate 8 local progress without claiming live approval.
- `docs/superpowers/verification/2026-07-21-gate-8-hackathon-release-readiness.md`: final local and approved live evidence.

## Task 1: Sanitized Release Health

**Files:**
- Modify: `src/app/api/health/route.test.ts`
- Modify: `src/app/api/health/route.ts`

- [ ] **Step 1: Add failing readiness and leakage assertions**

Extend the healthy test setup with:

```ts
process.env.TELEGRAM_BOT_TOKEN = "telegram-token-secret";
process.env.TELEGRAM_WEBHOOK_SECRET = "telegram_webhook_secret";
process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET = "telegram-processor-secret";
process.env.CRON_SECRET = "cron-secret";
```

Assert the response includes explicit booleans while retaining the legacy
`internalProcessorConfigured` field:

```ts
expect(json.checks).toMatchObject({
  telegramConfigured: true,
  telegramProcessorConfigured: true,
  schedulerConfigured: true,
  whatsappConfigured: true,
  whatsappProcessorConfigured: true,
  internalProcessorConfigured: true,
});
expect(fromMock).toHaveBeenCalledWith("telegram_webhook_events");
expect(fromMock).toHaveBeenCalledWith("proactive_check_in_schedules");
expect(JSON.stringify(json)).not.toContain("telegram-token-secret");
expect(JSON.stringify(json)).not.toContain("cron-secret");
```

Add a test proving optional WhatsApp absence does not degrade the Telegram-backed
judge path:

```ts
it("keeps core health ok when optional WhatsApp is unavailable", async () => {
  delete process.env.WHATSAPP_ACCESS_TOKEN;
  delete process.env.WHATSAPP_PHONE_NUMBER_ID;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
  delete process.env.META_APP_SECRET;
  delete process.env.TRUSTKAKI_DEMO_SENIOR_PHONE;

  const { GET } = await import("./route");
  const response = await GET();
  const json = await response.json();

  expect(response.status).toBe(200);
  expect(json.status).toBe("ok");
  expect(json.checks.whatsappConfigured).toBe(false);
  expect(json.checks.telegramConfigured).toBe(true);
});
```

- [ ] **Step 2: Run the health tests and confirm the new assertions fail**

Run:

```bash
npm test -- src/app/api/health/route.test.ts
```

Expected: FAIL because Telegram, scheduler, and explicit WhatsApp processor fields
do not exist and the additional tables are not queried.

- [ ] **Step 3: Implement the minimal readiness fields**

Add the two active fallback tables to `REQUIRED_TABLES`:

```ts
const REQUIRED_TABLES = [
  "seniors",
  "messages",
  "patterns",
  "caregiver_queue_items",
  "whatsapp_webhook_events",
  "telegram_webhook_events",
  "proactive_check_in_schedules",
] as const;
```

Build explicit booleans before constructing `checks`:

```ts
const whatsappProcessorConfigured = hasValue(
  process.env.WHATSAPP_INTERNAL_PROCESSOR_SECRET
);
const checks = {
  app: true,
  supabasePublicConfigured,
  supabaseServiceConfigured,
  database: supabaseServiceConfigured
    ? await canReachRequiredTables()
    : false,
  llmConfigured: hasValue(process.env.TRUSTKAKI_LLM_API_KEY),
  telegramConfigured:
    hasValue(process.env.TELEGRAM_BOT_TOKEN) &&
    hasValue(process.env.TELEGRAM_WEBHOOK_SECRET),
  telegramProcessorConfigured: hasValue(
    process.env.TELEGRAM_INTERNAL_PROCESSOR_SECRET
  ),
  schedulerConfigured: hasValue(process.env.CRON_SECRET),
  whatsappConfigured:
    hasValue(process.env.WHATSAPP_ACCESS_TOKEN) &&
    hasValue(process.env.WHATSAPP_PHONE_NUMBER_ID) &&
    hasValue(process.env.WHATSAPP_VERIFY_TOKEN) &&
    hasValue(process.env.META_APP_SECRET) &&
    hasValue(process.env.TRUSTKAKI_DEMO_SENIOR_PHONE),
  whatsappProcessorConfigured,
  internalProcessorConfigured: whatsappProcessorConfigured,
};
```

Do not add optional transport booleans to `criticalOk`.

- [ ] **Step 4: Run the health tests and confirm they pass**

Run:

```bash
npm test -- src/app/api/health/route.test.ts
```

Expected: all `/api/health` tests PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/app/api/health/route.ts src/app/api/health/route.test.ts
git commit -m "feat: expose sanitized release readiness"
```

## Task 2: Credential-Free Deployment Smoke Command

**Files:**
- Create: `scripts/release-smoke.test.ts`
- Create: `scripts/release-smoke.mjs`
- Modify: `package.json`

- [ ] **Step 1: Write failing subprocess tests against a local HTTP server**

Create a test that starts `node:http` on an ephemeral loopback port and invokes
the real script with `spawnSync` or `execFile`.

The success fixture must return:

```ts
const health = {
  status: "ok",
  checks: {
    app: true,
    supabasePublicConfigured: true,
    supabaseServiceConfigured: true,
    database: true,
    llmConfigured: true,
    telegramConfigured: true,
    telegramProcessorConfigured: true,
    schedulerConfigured: true,
    whatsappConfigured: false,
    whatsappProcessorConfigured: false,
    internalProcessorConfigured: false,
  },
  version: "0.1.0",
  commit: "0123456789ab",
};
```

Assert:

```ts
expect(result.code).toBe(0);
expect(result.stdout).toContain("PASS /api/health");
expect(result.stdout).toContain("PASS /privacy");
expect(result.stdout).toContain("PASS /data-deletion");
expect(result.stdout).toContain("RELEASE SMOKE PASSED");
expect(result.stdout).not.toContain("telegram-token");
```

Add separate tests for invalid URL, health 503, malformed health JSON, incorrect
content type, and timeout. Each must exit non-zero and print only the endpoint and
a bounded reason, never a response body.

- [ ] **Step 2: Run the smoke tests and confirm the missing-script failure**

Run:

```bash
npm test -- scripts/release-smoke.test.ts
```

Expected: FAIL because `scripts/release-smoke.mjs` does not exist.

- [ ] **Step 3: Implement the smoke script**

Use only Node.js built-ins and global `fetch`. The script contract is:

```js
const TIMEOUT_MS = 8000;
const baseUrl = normalizeBaseUrl(process.argv[2]);

await checkJson(baseUrl, "/api/health", (body) => {
  return body?.status === "ok" &&
    body?.checks?.app === true &&
    body?.checks?.database === true &&
    body?.checks?.llmConfigured === true &&
    typeof body?.checks?.telegramConfigured === "boolean" &&
    typeof body?.checks?.whatsappConfigured === "boolean";
});
await checkHtml(baseUrl, "/privacy");
await checkHtml(baseUrl, "/data-deletion");
process.stdout.write("RELEASE SMOKE PASSED\n");
```

`normalizeBaseUrl` must accept only `http:` and `https:`, strip the trailing slash,
and reject credentials in the URL. Every fetch must use:

```js
{
  method: "GET",
  redirect: "error",
  signal: AbortSignal.timeout(TIMEOUT_MS),
  headers: { accept: expectedContentType },
}
```

On failure, print `FAIL <path>: <bounded category>` to stderr and set exit code 1.
Allowed categories are `invalid base URL`, `timeout`, `network error`,
`unexpected status`, `unexpected content type`, and `invalid response`. Do not
print caught error messages or response bodies.

Add the package script:

```json
"release:smoke": "node scripts/release-smoke.mjs"
```

- [ ] **Step 4: Run smoke tests and lint the script**

Run:

```bash
npm test -- scripts/release-smoke.test.ts
npm run lint -- scripts/release-smoke.mjs scripts/release-smoke.test.ts
```

Expected: all smoke tests PASS and ESLint reports no errors.

- [ ] **Step 5: Commit Task 2**

```bash
git add package.json scripts/release-smoke.mjs scripts/release-smoke.test.ts
git commit -m "feat: add deployment smoke verification"
```

## Task 3: Complete Route And Secret Hardening

**Files:**
- Modify: `src/app/api/deployment-hardening.test.ts`
- Modify: `src/app/api/admin/contacts/[contactId]/route.ts`
- Modify: `src/app/api/admin/contacts/[contactId]/methods/route.ts`
- Modify: `src/app/api/admin/contact-methods/[methodId]/route.ts`
- Modify: `src/app/api/admin/seniors/[seniorId]/contacts/route.ts`
- Modify: `src/app/api/admin/seniors/[seniorId]/recipient-preview/route.ts`

- [ ] **Step 1: Replace the stale route list with recursive discovery**

Add a recursive helper using `readdirSync(..., { withFileTypes: true })`:

```ts
function filesUnder(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

const apiRouteFiles = filesUnder("src/app/api")
  .filter((file) => file.endsWith("/route.ts"))
  .sort();
```

Expand forbidden client values to include:

```ts
"TELEGRAM_BOT_TOKEN",
"TELEGRAM_WEBHOOK_SECRET",
"TELEGRAM_INTERNAL_PROCESSOR_SECRET",
"CRON_SECRET",
```

Discover client modules from all `.ts` and `.tsx` files whose source starts with
`"use client"` instead of maintaining the five-file list.

- [ ] **Step 2: Run the hardening test and confirm the five runtime failures**

Run:

```bash
npm test -- src/app/api/deployment-hardening.test.ts
```

Expected: FAIL for the five admin route files listed above because they do not
declare `export const runtime = "nodejs";`.

- [ ] **Step 3: Add explicit Node.js runtime declarations**

Add this after imports in each failing route:

```ts
export const runtime = "nodejs";
```

Do not change authorization, response, mutation, or persistence behavior.

- [ ] **Step 4: Run hardening and privileged-route regression tests**

Run:

```bash
npm test -- \
  src/app/api/deployment-hardening.test.ts \
  'src/app/api/admin/contact-methods/[methodId]/consent/route.test.ts' \
  'src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.test.ts' \
  'src/app/api/admin/seniors/[seniorId]/context/route.test.ts' \
  src/lib/persistence/contactPlanRepository.test.ts
```

Expected: all selected tests PASS.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/app/api/deployment-hardening.test.ts \
  'src/app/api/admin/contacts/[contactId]/route.ts' \
  'src/app/api/admin/contacts/[contactId]/methods/route.ts' \
  'src/app/api/admin/contact-methods/[methodId]/route.ts' \
  'src/app/api/admin/seniors/[seniorId]/contacts/route.ts' \
  'src/app/api/admin/seniors/[seniorId]/recipient-preview/route.ts'
git commit -m "test: complete deployment route hardening"
```

## Task 4: Hackathon Release Runbook And Current Documentation

**Files:**
- Create: `docs/operations/HACKATHON_RELEASE_RUNBOOK.md`
- Modify: `README.md`
- Modify: `docs/TrustKaki_BUILD_ROADMAP.md`

- [ ] **Step 1: Write the runbook with executable, non-secret procedures**

Use these exact top-level sections:

```markdown
# TrustKaki Hackathon Release Runbook

## Scope And Owner
## Stop Conditions
## Pre-Deployment
## Required Configuration Names
## Deploy And Public Smoke
## Authenticated Judge Verification
## Telegram Demo Verification
## WhatsApp Restoration Attempt
## Rollback Rehearsal
## Incident Response
## Cleanup
## Go Or No-Go Record
```

The runbook must state that the project owner is release operator for the
hackathon only. Include commands only in non-secret form:

```bash
npm run validate
npm audit --omit=dev
npx supabase migration list --linked
export TRUSTKAKI_RELEASE_URL=https://trustkaki.vercel.app
npm run release:smoke -- "$TRUSTKAKI_RELEASE_URL"
npx vercel inspect "$TRUSTKAKI_RELEASE_URL"
```

For deployment and rollback, instruct the operator to record deployment IDs and
commit SHAs but never tokens, Auth UUIDs, phone numbers, Telegram identifiers, or
payloads. The rollback procedure must identify the last verified deployment,
promote or roll back through Vercel, rerun public smoke, then rerun authenticated
read-only checks before restoring any webhook or schedule activity.

The no-go list must include:

```markdown
- core health is degraded;
- deployed commit does not match the approved commit;
- caregiver or senior isolation fails;
- a secret, raw destination, provider identifier, or payload leaks;
- normal caregivers receive technical traces or demo-admin controls;
- deterministic policy is bypassed or memory changes risk directly;
- both Telegram and WhatsApp controlled message paths fail;
- rollback cannot restore the last verified deployment;
- any Critical or Important final-audit finding remains unresolved.
```

- [ ] **Step 2: Update README release commands and stale Telegram limitation**

Replace the curl-only health instruction with:

```bash
export TRUSTKAKI_RELEASE_URL=https://trustkaki.vercel.app
npm run release:smoke -- "$TRUSTKAKI_RELEASE_URL"
```

Keep the direct `/api/health` explanation. Link the runbook from Project
Documentation. Replace the stale claim that Telegram live verification is
outstanding with an accurate statement that the bounded Telegram production
path passed on 15 July 2026 and must be reverified for the final selected commit.

- [ ] **Step 3: Mark Gate 8 local readiness as in progress**

In the roadmap, expand Gate 8 into checkboxes. Mark only implemented local items
complete. Keep deployment, WhatsApp retry, live Telegram re-verification,
rollback rehearsal, independent audit, and final go/no-go unchecked until real
evidence exists.

- [ ] **Step 4: Check documentation for sensitive literals and incomplete wording**

Run:

```bash
rg -n "Bearer [A-Za-z0-9]|\+[0-9]{8,}|bot[0-9]+:|paste (the )?(token|secret|key)" \
  docs/operations/HACKATHON_RELEASE_RUNBOOK.md README.md \
  docs/TrustKaki_BUILD_ROADMAP.md
```

Expected: no secret-like content. Read each changed document once to confirm
there are no unfinished instructions or ambiguous operator responsibilities.

- [ ] **Step 5: Commit Task 4**

```bash
git add docs/operations/HACKATHON_RELEASE_RUNBOOK.md README.md \
  docs/TrustKaki_BUILD_ROADMAP.md
git commit -m "docs: add hackathon release runbook"
```

## Task 5: Local Release Verification And Dependency Assessment

**Files:**
- Create: `docs/superpowers/verification/2026-07-21-gate-8-hackathon-release-readiness.md`

- [ ] **Step 1: Run complete local validation**

Run:

```bash
npm run validate
```

Expected: all tests pass, TypeScript passes, ESLint passes, and the production
build completes. Record exact counts and warnings.

- [ ] **Step 2: Assess production dependency advisories without mutation**

Run:

```bash
npm audit --omit=dev
```

Expected: record the production advisory result. Do not run `npm audit fix`,
`npm audit fix --force`, or change dependency ranges during this task. If a
production Critical or High advisory exists on an exercised release path, Gate 8
is blocked pending a separately reviewed dependency change.

- [ ] **Step 3: Run a local smoke test against a production build**

Start the built app on an unused local port with non-live configuration, then run:

```bash
npm run release:smoke -- http://127.0.0.1:3108
```

Expected: public checks pass. Do not invoke webhooks, processors, simulators,
demo reset, or outbound providers.

- [ ] **Step 4: Write local verification evidence**

The verification record must include:

```markdown
# Gate 8 Hackathon Release Readiness Verification

## Scope
## Local Validation
## Dependency Assessment
## Public Smoke
## Security And Privacy Checks
## Live Checkpoints Still Required
## Current Decision
```

Set `Current Decision` to `LOCAL READINESS PASSED; LIVE RELEASE APPROVAL PENDING`
only when Steps 1-3 pass. List deployment, authenticated production review,
transport re-verification, rollback rehearsal, final audit, and cleanup as
pending evidence.

- [ ] **Step 5: Commit Task 5**

```bash
git add docs/superpowers/verification/2026-07-21-gate-8-hackathon-release-readiness.md
git commit -m "docs: verify gate 8 local release readiness"
```

## Task 6: Independent Local Audit

**Files:**
- No edits during audit.

- [ ] **Step 1: Audit the Gate 8 local diff**

Review from design baseline `093b2d3` through the current head. Cover health
leakage, status semantics, smoke command SSRF/credential handling, timeouts,
route discovery, runtime declarations, simulator and processor auth, runbook
safety, rollback accuracy, dependency evidence, and documentation claims.

- [ ] **Step 2: Remediate valid findings with focused tests**

For each Critical or Important finding, write a failing regression test, verify
the failure, implement the smallest fix, rerun focused tests, and commit one
coherent remediation. Minor findings may be fixed when low-risk or recorded for
the final release audit.

- [ ] **Step 3: Rerun complete validation**

```bash
npm run validate
```

Expected: complete PASS before any live checkpoint.

## Task 7: Explicitly Approved Live Release Checkpoints

**Files:**
- Modify after evidence: `docs/superpowers/verification/2026-07-21-gate-8-hackathon-release-readiness.md`
- Modify after approval: `docs/TrustKaki_BUILD_ROADMAP.md`

- [ ] **Step 1: Stop and request approval for read-only linked-project inspection**

Inspect only project names, deployment metadata, migration history, and
environment-variable names. Never print values.

- [ ] **Step 2: Stop and request approval for deployment**

Deploy the selected audited commit to preview first. Run public smoke and the
manual authenticated checklist. Promote only after both pass.

- [ ] **Step 3: Stop and request approval for controlled transport checks**

Reverify Telegram with one pre-approved fictional message. Attempt WhatsApp
restoration only through valid Meta account recovery and signed webhook setup.
Record bounded counts and statuses, not identifiers or payloads.

- [ ] **Step 4: Stop and request approval for rollback rehearsal**

Rehearse against preview where possible. If production rollback is required,
obtain separate approval, restore the last verified deployment, rerun smoke and
authenticated checks, then return to the selected release only after approval.

- [ ] **Step 5: Complete final audit and go/no-go record**

The final independent audit covers the complete Gate 8 diff and live evidence.
Only after no Critical or Important findings remain may the verification record
state `GO FOR HACKATHON DEMO`. Update the roadmap to Gate 8 complete, commit the
evidence, push the branch, merge by fast-forward, validate merged `main`, and
push `main`.
