# TrustKaki

TrustKaki is a hackathon MVP for helping AAC staff and caregivers notice when an older adult may need human follow-up. It is not only a senior chatbot: the main operational view is a caregiver follow-up queue backed by persisted messages, structured agent runs, deterministic safety policy, Pattern Watch, and caregiver action history.

## Product Focus

TrustKaki watches ordinary senior check-ins for practical changes that are easy to miss:

- reduced appetite
- mobility or frailty signals
- social hesitation or withdrawal
- suspicious digital-safety messages
- repeated patterns across days

The demo is designed for AAC staff, caregivers, and hackathon judges. A judge should be able to reset the demo, run Quick Demo, inspect one consolidated follow-up case, record an outcome, resolve it, and see that the active queue clears while history remains.

## Core Features

- Multi-agent orchestration with typed Triage, AAC Nudge, Digital Safety, and Briefing agents.
- Deterministic policy layer for final safety-critical risk decisions.
- Supabase persistence for messages, agent runs, detected signals, risk events, alerts, briefs, Pattern Watch output, caregiver queue items, and caregiver actions.
- Quick Demo path that seeds a four-day history, validates signals, evaluates deterministic patterns, and builds the caregiver queue.
- Meta WhatsApp Cloud API webhook foundation with durable Supabase inbox, deduplication, async `after()` fast path, and protected retry processor.
- Judge View with concise main queue card and progressive detail disclosure.

## Architecture

```text
Senior message / demo history
  -> Orchestrator and specialist agents
  -> validated structured outputs
  -> deterministic policy and Pattern Watch
  -> Supabase persistence
  -> caregiver queue and dashboard state
  -> caregiver action history
```

Important boundaries:

- React components call API routes, not Supabase directly.
- Supabase service-role access stays server-side.
- LLM provider calls stay server-side.
- WhatsApp tokens and Meta secrets stay server-side.
- `NEXT_PUBLIC_*` values are the only browser-exposed environment variables.

## Local Setup

Install dependencies:

```bash
npm install
```

Create local environment values:

```bash
cp .env.example .env.local
```

Fill in `.env.local` with TrustKaki Supabase and LLM values. Do not commit `.env.local`.

Run the app:

```bash
npm run dev
```

Open `http://localhost:3000`.

Run the complete local quality gate:

```bash
npm run validate
```

This runs all unit tests, TypeScript checking, ESLint, and the production build.
The live two-user Supabase suite remains separately opt-in because it creates
and removes temporary Auth users and database rows.

## Environment Variables

Required for Judge View:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRUSTKAKI_LLM_API_KEY`
- `TRUSTKAKI_LLM_BASE_URL`
- `TRUSTKAKI_LLM_MODEL`
- `TRUSTKAKI_LLM_TIMEOUT_MS`

Required for live WhatsApp:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_GRAPH_API_VERSION`
- `META_APP_SECRET`
- `TRUSTKAKI_DEMO_SENIOR_PHONE`
- `WHATSAPP_INTERNAL_PROCESSOR_SECRET`

Development-only:

- `ENABLE_WHATSAPP_DEV_SIMULATOR`

Optional:

- `ENABLE_FULL_AGENT_REPLAY=true` allows the slow Full Agent Replay in production. Leave it unset for the primary judge deployment.

Notes:

- All secrets are server-side unless prefixed with `NEXT_PUBLIC_`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` is browser-safe public Supabase configuration; it is not the service-role key.
- Meta temporary access tokens are development-only. A production WhatsApp setup should use an appropriate durable Meta credential.
- WorkBuddy can later replace or extend the LLM provider through `src/lib/agents/provider.ts` without rewriting Pattern Watch, Supabase persistence, or the caregiver queue.

## Supabase

Apply migrations to the TrustKaki Supabase project:

```bash
supabase db push
```

Then apply `supabase/seed.sql` through the Supabase SQL editor or your preferred `psql` workflow for the TrustKaki project.

If using the Supabase dashboard instead of CLI, apply the SQL files under:

```text
supabase/migrations/
supabase/seed.sql
```

Do not point deployment environment variables at unrelated Supabase projects.

### Supabase Integration Tests

The caregiver isolation suite is opt-in because it creates temporary Auth users
and database rows in the configured TrustKaki Supabase project:

```bash
TRUSTKAKI_RUN_DB_INTEGRATION=1 ./node_modules/.bin/vitest run src/lib/security/rls.integration.test.ts
```

It uses the existing Supabase URL, anon key, and service-role key from the test
process environment. Privileged access is limited to fixture setup, assertions,
and cleanup. The tested operations run as two real authenticated caregivers.
Temporary rows and Auth users are removed after the suite, including when setup
or an assertion fails. Generated credentials and database rows are never logged.

### Supabase Auth Setup

Public sign-up is intentionally not exposed. Create caregiver and judge users in Supabase Auth through an administrator-controlled process.

For the judge account:

1. Create the Supabase Auth user privately.
2. Set trusted `app_metadata.role` to `demo_admin`.
3. Link that Auth user UUID to Rachel Tan:

```sql
update public.caregivers
set auth_user_id = '<judge-auth-user-uuid>'
where external_ref = 'demo_rachel_tan';
```

Do not use `user_metadata` for authorization. Do not commit judge credentials or Auth UUIDs.

## Health Check

The deployment smoke check is:

```bash
curl https://<deployment-url>/api/health
```

The response is sanitized and only reports booleans plus non-sensitive version metadata. It does not call the LLM, call Meta, send WhatsApp messages, expose phone numbers, or mutate data.

## Test Commands

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
npm run lint
npm run build
```

## Vercel Deployment

Recommended first deployment target: Vercel.

1. Import the GitHub repository into Vercel.
2. Configure the environment variables above in Vercel Project Settings.
3. Deploy without changing Meta callback settings.
4. Check `/api/health`.
5. Run the Judge View Quick Demo.
6. Only after the app is verified, configure Meta’s callback URL for live WhatsApp testing.

All TrustKaki API routes are intended for the Node.js runtime. Do not move them to Edge runtime.

## WhatsApp Webhook Overview

Current flow:

```text
Meta webhook
  -> /api/whatsapp/webhook
  -> signature verification when META_APP_SECRET is configured
  -> Supabase webhook inbox
  -> after() fast-path processor
  -> orchestration and persistence
  -> outbound WhatsApp reply
```

Recovery flow:

```text
POST /api/internal/whatsapp/process-pending
Authorization: Bearer <WHATSAPP_INTERNAL_PROCESSOR_SECRET>
```

This endpoint processes a bounded number of received or failed events and returns non-sensitive counts. It is a recovery path; it does not replace immediate `after()` processing.

## EdgeOne Future Note

Tencent EdgeOne remains a future deployment option, especially for Tencent alignment. Before switching, verify that the chosen EdgeOne Next.js hosting path supports the Node.js runtime behavior TrustKaki needs: Supabase service-role access, `node:crypto`, route handlers, outbound HTTP calls, function duration limits, and `after()`/`waitUntil` semantics.

## WorkBuddy Portability

The current LLM provider uses an OpenAI-compatible Chat Completions interface. WorkBuddy integration should be added as a provider adapter that preserves the existing runner contract:

```ts
chat({ systemPrompt, userPrompt, model, temperature, maxTokens })
```

Do not bypass deterministic policy, Pattern Watch, or Supabase persistence when adding a WorkBuddy provider.

## Security Notes

- Do not expose `.env.local` or secret values.
- Do not put server secrets in client components.
- Do not expose service-role Supabase keys to the browser.
- Do not expose raw provider responses or stack traces from API routes in production.
- Keep the WhatsApp dev simulator disabled in production.
- Keep demo reset scoped to TrustKaki demo data.
- The MVP rate limiter is in-process and single-instance only. Replace it with Redis or a platform rate-limit service before multi-instance production scaling.
- API routes derive caregiver identity from the verified Supabase Auth user, not from browser-submitted caregiver IDs.

## Known Limitations

- Public self-service registration, password reset, and organization administration are intentionally out of scope.
- Full Agent Replay is slow and is not the primary production judge path.
- WhatsApp recovery is protected but still needs an external scheduler or manual trigger for production-grade retry cadence.
- WorkBuddy provider integration is not implemented yet.
- EdgeOne deployment has not been verified yet.
