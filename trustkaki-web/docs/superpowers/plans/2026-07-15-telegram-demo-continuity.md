# Telegram Demo Continuity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Telegram as a temporary live-demo messaging adapter while preserving WhatsApp as the preferred production channel and reusing TrustKaki's real orchestration, deterministic policy, Supabase persistence, and dashboard.

**Architecture:** Telegram receives authenticated webhook updates into its own durable, service-role-only inbox. A worker maps the Telegram user to a senior through a provider-neutral identity table, invokes the existing orchestrator, persists the existing authoritative care result, sends one concise reply through Telegram, and records provider metadata. The existing WhatsApp implementation remains operational and unchanged except for the smallest metadata helper made provider-aware.

**Tech Stack:** Next.js App Router, TypeScript, Zod, native `fetch`, Supabase/Postgres, Vitest, Vercel Functions, Telegram Bot API.

---

## Scope And Invariants

- Telegram is a temporary live-demo transport, not a replacement for WhatsApp in the product direction.
- Telegram and WhatsApp must call the same `orchestrate` function and deterministic policy implementation.
- No agent prompts, risk rules, caregiver workflows, dashboard design, or WhatsApp webhook behavior change in this gate.
- Telegram identity is mapped in Supabase. Unknown Telegram users are ignored safely and never mapped to a demo senior by fallback.
- `update_id` is the durable idempotency key. A repeated webhook must not rerun agents, duplicate care records, or intentionally send another reply.
- Webhook authentication uses Telegram's `X-Telegram-Bot-Api-Secret-Token` header and fails closed when the server secret is absent or incorrect.
- The webhook returns success only after durable acceptance. Orchestration and outbound sending occur after acceptance through `after()` and a protected retry endpoint.
- Telegram tokens, webhook secrets, raw chat identifiers, and provider responses never appear in API responses or logs.
- A successful `sendMessage` response means provider-accepted only. TrustKaki must not label it delivered or read because Telegram does not provide equivalent receipt webhooks for this flow.
- Telegram transport events remain separate from persisted conversation messages.
- No Telegram SDK is added; the Bot API needs only native `fetch` and Zod validation.

## Audit Findings

### Reusable without modification

- `src/lib/agents/orchestrator.ts` already conditionally invokes the typed specialist agents and returns policy-authoritative results.
- `src/lib/persistence/orchestrationRepository.ts` already persists inbound/outbound messages, agent runs, signals, final policy risk, approved alerts, briefings, and Pattern Watch results.
- `messages.external_platform`, `messages.external_message_id`, and `messages.external_metadata` already support provider metadata structurally.
- The dashboard reads the same persisted care state regardless of how a message arrived.

### WhatsApp-specific boundaries

- `src/app/api/whatsapp/webhook/route.ts`: Meta verification/signature and webhook acceptance.
- `src/lib/whatsapp/parser.ts`: Meta payload and delivery-status parsing.
- `src/lib/whatsapp/client.ts`: Graph API request construction and response handling.
- `src/lib/persistence/whatsappEventRepository.ts` and `whatsapp_webhook_events`: durable Meta inbox, claim, retry, and outbound state.
- `src/lib/persistence/seniorContextRepository.ts`: senior lookup is currently phone-only.
- `recordInboundMessageMetadata` and `recordOutboundMessageMetadata` currently hard-code `external_platform = 'whatsapp'` despite otherwise generic arguments.

### Narrow design decision

Do not generalize or replace the working WhatsApp inbox. Add a Telegram-specific durable inbox because its event and receipt semantics differ. Add one small `senior_messaging_identities` table because adding a new provider column to `seniors` for every future channel would create avoidable schema churn.

## Execution Checkpoints

Implementation is intentionally split. Stop and report after each checkpoint unless the user explicitly asks to continue:

1. Database identity and durable inbox.
2. Pure Telegram parser, authentication, and client.
3. Orchestration worker and persistence integration.
4. Routes, deployment configuration, and live verification.

## Task 1: Database Identity And Durable Inbox

**Files:**
- Create via Supabase CLI: `supabase/migrations/<CLI-generated timestamp>_telegram_demo_continuity.sql`
- Modify: `src/lib/supabase/types.ts`
- Create: `src/lib/security/telegramMigration.test.ts`
- Create: `src/lib/persistence/seniorMessagingIdentityRepository.ts`
- Create: `src/lib/persistence/seniorMessagingIdentityRepository.test.ts`
- Create: `src/lib/persistence/telegramEventRepository.ts`
- Create: `src/lib/persistence/telegramEventRepository.test.ts`

- [ ] **Step 1: Check current Supabase guidance and migration state**

Run:

```bash
npx supabase --version
npx supabase migration list
```

Read the current Supabase changelog before writing database code. Do not edit an already-applied migration.

- [ ] **Step 2: Write failing migration-contract tests**

Test that the new migration defines:

- `senior_messaging_identities` with UUID primary key, `senior_id` foreign key, constrained `platform`, opaque `external_user_id`, optional `external_chat_id`, active/verified state, timestamps, and unique active identity per platform/user.
- `telegram_webhook_events` with UUID primary key, unique Telegram `update_id`, message/user/chat identifiers stored as text, payload JSON, processing state, retry fields, stored orchestration result/context, selected reply, outbound state/message ID, and timestamps.
- service-role-only RLS on both tables.
- an atomic `claim_telegram_webhook_event` function that only claims `received` or `failed` rows.
- indexes for retry scans and senior identity lookup.

Run and confirm RED:

```bash
npx vitest run src/lib/security/telegramMigration.test.ts
```

- [ ] **Step 3: Create the migration through the normal workflow**

Run:

```bash
npx supabase migration new telegram_demo_continuity
```

Edit only the CLI-created file. Use text for Telegram IDs to avoid JavaScript integer precision assumptions. Do not copy WhatsApp delivery-status columns that Telegram cannot populate.

- [ ] **Step 4: Add typed database definitions**

Update `src/lib/supabase/types.ts` for both tables and `claim_telegram_webhook_event`. Keep the generated database shape explicit and consistent with existing project types.

- [ ] **Step 5: Write failing repository tests**

Prove:

- an active verified Telegram identity resolves to exactly one senior;
- an unknown or inactive identity resolves to `null`;
- duplicate `update_id` returns the existing inbox row;
- claiming is atomic;
- retry listing is bounded;
- stored errors are sanitized;
- orchestration completion and outbound state are resumable.

Run and confirm RED:

```bash
npx vitest run src/lib/persistence/seniorMessagingIdentityRepository.test.ts src/lib/persistence/telegramEventRepository.test.ts
```

- [ ] **Step 6: Implement the two narrow repositories**

`seniorMessagingIdentityRepository.ts` owns identity lookup only. `telegramEventRepository.ts` mirrors the proven claim/resume behavior of the WhatsApp event repository without sharing provider-specific row types.

- [ ] **Step 7: Verify checkpoint 1**

Run:

```bash
npx vitest run src/lib/security/telegramMigration.test.ts src/lib/persistence/seniorMessagingIdentityRepository.test.ts src/lib/persistence/telegramEventRepository.test.ts
npm run typecheck
git diff --check
```

Apply the migration to the linked `trustkaki` project only after dry-run review, then confirm local/remote migration history. Run Supabase security and performance advisors because database code changed.

- [ ] **Step 8: Commit checkpoint 1**

```bash
git add supabase/migrations src/lib/supabase/types.ts src/lib/security/telegramMigration.test.ts src/lib/persistence/seniorMessagingIdentityRepository.ts src/lib/persistence/seniorMessagingIdentityRepository.test.ts src/lib/persistence/telegramEventRepository.ts src/lib/persistence/telegramEventRepository.test.ts
git commit -m "feat: add telegram identity and durable inbox"
```

## Task 2: Telegram Parser, Webhook Authentication, And Client

**Files:**
- Create: `src/lib/telegram/types.ts`
- Create: `src/lib/telegram/schemas.ts`
- Create: `src/lib/telegram/parser.ts`
- Create: `src/lib/telegram/parser.test.ts`
- Create: `src/lib/telegram/webhookAuth.ts`
- Create: `src/lib/telegram/webhookAuth.test.ts`
- Create: `src/lib/telegram/client.ts`
- Create: `src/lib/telegram/client.test.ts`
- Create: `src/lib/telegram/logging.ts`

- [ ] **Step 1: Write failing parser tests**

Cover a realistic private-chat text update and prove extraction of `update_id`, `message_id`, sender user ID, chat ID, timestamp, and text. Prove edited messages, bot senders, non-text messages, groups, channels, and malformed payloads are ignored safely.

- [ ] **Step 2: Write failing webhook-auth tests**

Prove matching secrets succeed, missing configuration fails closed, wrong/missing headers fail, and comparison does not expose either value.

- [ ] **Step 3: Write failing outbound-client tests**

Prove the request uses server-side `POST https://api.telegram.org/bot{token}/sendMessage`, sends only `{ chat_id, text }`, validates Telegram's response with Zod, extracts the provider message ID, handles timeout/error responses safely, and never includes the token in thrown/logged text.

Run and confirm RED:

```bash
npx vitest run src/lib/telegram/parser.test.ts src/lib/telegram/webhookAuth.test.ts src/lib/telegram/client.test.ts
```

- [ ] **Step 4: Implement the pure transport modules**

Use Zod at the untrusted webhook and provider-response boundaries. Use native `fetch` and an explicit timeout. Keep the token in server-only code. Log only sanitized event IDs/status categories, never raw user/chat IDs or payloads.

- [ ] **Step 5: Verify checkpoint 2**

Run:

```bash
npx vitest run src/lib/telegram/parser.test.ts src/lib/telegram/webhookAuth.test.ts src/lib/telegram/client.test.ts
npm run typecheck
npm run lint
git diff --check
```

- [ ] **Step 6: Commit checkpoint 2**

```bash
git add src/lib/telegram
git commit -m "feat: add typed telegram transport"
```

## Task 3: Reuse The Real Orchestration And Care Persistence

**Files:**
- Modify: `src/lib/persistence/orchestrationRepository.ts`
- Modify: `src/lib/persistence/orchestrationRepository.test.ts`
- Modify: `src/lib/persistence/seniorContextRepository.ts`
- Modify: `src/lib/persistence/seniorContextRepository.test.ts`
- Create: `src/lib/messaging/selectSeniorReply.ts`
- Create: `src/lib/messaging/selectSeniorReply.test.ts`
- Create: `src/lib/telegram/service.ts`
- Create: `src/lib/telegram/service.test.ts`

- [ ] **Step 1: Write failing provider-metadata tests**

Extend the metadata helpers to require `externalPlatform: 'whatsapp' | 'telegram'`. Prove existing WhatsApp calls remain WhatsApp and Telegram calls persist Telegram. Do not change delivery-status handling.

- [ ] **Step 2: Write failing Telegram senior-context tests**

Prove server-side identity lookup loads the same typed `AgentRunContext` used by WhatsApp and authenticated APIs, and unknown Telegram identities return `null` without demo fallback.

- [ ] **Step 3: Extract and test only the existing reply-selection rule**

Move the small `digital_safety`, then `triage`, then first-message priority rule from `src/lib/whatsapp/service.ts` into `src/lib/messaging/selectSeniorReply.ts`. Keep behavior byte-for-byte compatible for WhatsApp and add focused tests. Do not extract a generic workflow framework.

- [ ] **Step 4: Write failing Telegram service tests**

Prove:

- one accepted update invokes the existing orchestrator once;
- the exact policy-authoritative orchestration result reaches `persistOrchestrationResult`;
- agent runs, signals, risk, alerts, briefing, and Pattern Watch remain owned by existing persistence;
- inbound and one selected outbound conversation message receive Telegram metadata;
- duplicate/retried updates resume stored orchestration and do not rerun agents;
- an unknown user does not invoke agents or send a reply;
- a send failure leaves a retryable event without partial duplicate care records;
- a successful send is stored as provider-accepted, not delivered/read;
- no secret or raw chat ID is returned or logged.

Run and confirm RED:

```bash
npx vitest run src/lib/persistence/orchestrationRepository.test.ts src/lib/persistence/seniorContextRepository.test.ts src/lib/messaging/selectSeniorReply.test.ts src/lib/telegram/service.test.ts
```

- [ ] **Step 5: Implement the Telegram service**

Follow the proven WhatsApp sequence:

```text
claim event
-> resolve verified Telegram identity
-> load senior context server-side
-> orchestrate once or resume stored result
-> persist existing care result once
-> send one concise senior reply
-> persist Telegram outbound metadata
-> mark event processed
```

Keep policy risk authoritative. Do not persist raw Triage risk as final risk. Do not send internal agent messages.

- [ ] **Step 6: Verify checkpoint 3**

Run:

```bash
npx vitest run src/lib/persistence/orchestrationRepository.test.ts src/lib/persistence/seniorContextRepository.test.ts src/lib/messaging/selectSeniorReply.test.ts src/lib/telegram/service.test.ts src/lib/whatsapp/service.test.ts
npm run typecheck
npm run lint
git diff --check
```

- [ ] **Step 7: Commit checkpoint 3**

```bash
git add src/lib/persistence/orchestrationRepository.ts src/lib/persistence/orchestrationRepository.test.ts src/lib/persistence/seniorContextRepository.ts src/lib/persistence/seniorContextRepository.test.ts src/lib/messaging src/lib/telegram/service.ts src/lib/telegram/service.test.ts src/lib/whatsapp/service.ts src/lib/whatsapp/service.test.ts
git commit -m "feat: route telegram through trustkaki orchestration"
```

## Task 4: Webhook, Retry Route, And Safe Configuration

**Files:**
- Create: `src/app/api/telegram/webhook/route.ts`
- Create: `src/app/api/telegram/webhook/route.test.ts`
- Create: `src/app/api/internal/telegram/process-pending/route.ts`
- Create: `src/app/api/internal/telegram/process-pending/route.test.ts`
- Create: `src/app/api/telegram/dev/simulate/route.ts`
- Create: `src/app/api/telegram/dev/simulate/route.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write failing webhook-route tests**

Prove invalid/missing secret headers return 403, valid supported updates are durably accepted before processing is scheduled, duplicates return safe 200 without scheduling, unsupported updates return safe 200, durable acceptance failure returns a retryable non-2xx response, and responses contain no secrets or user/chat identifiers.

- [ ] **Step 2: Write failing retry-route tests**

Use a dedicated `TELEGRAM_INTERNAL_PROCESSOR_SECRET`. Prove missing configuration returns 404, bad authorization returns 401, limits are bounded, and results expose only counts/status categories.

- [ ] **Step 3: Write failing development-simulation tests**

Reuse the exact parser, acceptance, orchestration, persistence, and send path. Require non-production mode plus explicit development authorization. Inject a fake outbound client by default so local simulation never contacts Telegram accidentally. Prove duplicate submissions are idempotent.

- [ ] **Step 4: Implement the routes**

Use `after()` only after the inbox insert succeeds. Keep route responses small and non-identifying. Do not add a Telegram GET verification route because Telegram uses `setWebhook` rather than Meta's challenge flow.

- [ ] **Step 5: Document configuration without values**

Add only names and explanations:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_WEBHOOK_SECRET
TELEGRAM_INTERNAL_PROCESSOR_SECRET
```

Document that `TELEGRAM_WEBHOOK_SECRET` must use only Telegram-supported characters and that secrets stay server-side. Do not modify `.env.local` without explicit approval.

- [ ] **Step 6: Verify checkpoint 4 locally**

Run:

```bash
npx vitest run src/app/api/telegram/webhook/route.test.ts src/app/api/internal/telegram/process-pending/route.test.ts src/app/api/telegram/dev/simulate/route.test.ts
npm run validate
git diff --check
```

Run one local simulation twice with the same `update_id`. Verify the first run persists and invokes orchestration once; the second is a duplicate; one outbound request body is generated; no secrets or raw identifiers appear in output.

- [ ] **Step 7: Commit checkpoint 4**

```bash
git add src/app/api/telegram src/app/api/internal/telegram .env.example README.md
git commit -m "feat: add reliable telegram webhook"
```

## Task 5: Live Telegram Verification

**Prerequisite:** The user creates a bot with BotFather and provides secrets only through `.env.local`/Vercel environment-variable interfaces, never in chat or logs.

- [ ] **Step 1: Bind one real demo senior identity**

After the senior sends `/start`, obtain the Telegram user/chat IDs through a controlled diagnostic that redacts values in output. Insert the verified identity for the intended senior into `senior_messaging_identities`. Do not seed a personal identifier into source control.

- [ ] **Step 2: Configure Vercel Production secrets**

Upload the three Telegram variables to the existing TrustKaki Vercel project without printing values. Redeploy only after local validation and explicit deployment approval.

- [ ] **Step 3: Register the production webhook**

Call Telegram `setWebhook` server-side with:

- URL `https://trustkaki.vercel.app/api/telegram/webhook`
- `secret_token` from `TELEGRAM_WEBHOOK_SECRET`
- `allowed_updates: ['message']`
- `drop_pending_updates: true` only for the initial controlled setup

Verify with `getWebhookInfo`; report only URL, pending count, and sanitized error state.

- [ ] **Step 4: Prove the real end-to-end flow**

Send `Not hungry today. Knee pain.` from the mapped senior account. Verify:

- one durable Telegram inbox row;
- one inbound conversation message with `external_platform = 'telegram'`;
- actual agent runs and policy trace;
- policy-authoritative risk event only;
- approved alerts/briefing only;
- one concise Telegram reply received by the senior;
- one outbound conversation message with Telegram provider metadata;
- dashboard reflects the persisted state after refresh;
- resending the same fixture/update does not duplicate processing.

- [ ] **Step 5: Record truthful evidence**

Create `docs/superpowers/verification/2026-07-15-gate-3t-live-telegram.md` with redacted commands, test counts, persistence evidence, reply receipt, limitations, and the continuing Meta account restriction. Update roadmap/handoff only after live evidence passes.

- [ ] **Step 6: Final validation and commit**

```bash
npm run validate
git status --short
git diff --check
git add docs/superpowers/verification/2026-07-15-gate-3t-live-telegram.md docs/TrustKaki_BUILD_ROADMAP.md docs/TrustKaki_CODEX_HANDOFF.md
git commit -m "docs: verify live telegram continuity"
```

## Exit Criteria

- A real Telegram message from a verified mapped senior receives one real TrustKaki reply.
- The same real orchestrator, specialist agents, deterministic policy, persistence, Pattern Watch, and dashboard are used.
- Duplicate Telegram updates do not rerun agents or duplicate care records.
- Unknown users are not mapped or processed as seniors.
- Webhook and internal processing endpoints fail closed and expose no secrets or identifiers.
- Supabase persistence survives refresh.
- WhatsApp code remains available and documented as the preferred production channel pending Meta account recovery.
- `npm run validate` passes and live verification evidence is recorded before Gate 3T is marked complete.

## Explicit Non-Goals

- No caregiver/family outbound notifications through Telegram in this gate.
- No proactive scheduler or Telegram templates.
- No groups, channels, media, voice, edited messages, inline queries, or rich messages.
- No Telegram login for caregivers.
- No new dashboard redesign.
- No deletion or replacement of WhatsApp code, configuration, evidence, or product direction.
