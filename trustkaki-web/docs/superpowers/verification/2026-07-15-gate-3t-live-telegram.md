# Gate 3T Live Telegram Verification

**Date:** 15 July 2026  
**Production:** `https://trustkaki.vercel.app`  
**Telegram role:** temporary live-demo transport; WhatsApp remains the preferred production channel.

## Result

Gate 3T passed its bounded live-continuity scope. A verified Telegram identity
mapped to Mr Tan Ah Hock sent `Not hungry today. Knee pain.` to the real bot and
received one concise TrustKaki reply. The request used the production webhook,
durable inbox, existing multi-agent orchestrator, deterministic policy, Supabase
persistence, and authenticated caregiver dashboard. Replaying the exact stored
Telegram update was idempotent.

## Deployment And Webhook Evidence

- Vercel project: existing TrustKaki project only.
- Production deployment: `dpl_3p9shkabpJuM1FmU2UAjsJ4QFXGP`.
- Production alias: `https://trustkaki.vercel.app`.
- Telegram webhook: `https://trustkaki.vercel.app/api/telegram/webhook`.
- Allowed update type: `message`.
- Webhook registration readback: registered, zero pending updates, no sanitized
  error state.
- A request without the webhook secret received HTTP 403.
- Telegram tokens, webhook secrets, internal processor secrets, and raw Telegram
  identifiers were not printed or recorded in this document.

The production variables are `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
and `TELEGRAM_INTERNAL_PROCESSOR_SECRET`. All remain server-side.

## Live Workflow Evidence

The real inbound event completed with one processing attempt and an accepted
outbound provider response. Provider acceptance means Telegram accepted the
`sendMessage` request; it is not presented as a delivered or read receipt.

Persisted records tied to the exact live event trace:

| Record | Count / result |
| --- | --- |
| Telegram inbox event | 1, processed |
| Inbound conversation message | 1, Telegram metadata stored |
| Outbound conversation message | 1, Telegram metadata stored |
| Agent runs | 6 |
| Validated signals | 2 |
| Policy-authoritative risk transitions | 0 |
| Policy-approved alerts | 1 |
| Policy briefing | 1, trigger `policy` |

The six recorded runs were Orchestrator Agent, Triage Agent, AAC Nudge Agent,
Briefing Agent, Pattern Watch Engine, and Deterministic Policy. All completed
without fallback or recorded error.

Triage produced one medium health signal and one medium daily-living signal.
Policy returned final risk Yellow, no risk movement, one approved alert, and a
required policy briefing with a two-rule trace. No `risk_events` transition row
was written because the senior was already Yellow. This confirms raw Triage
risk did not overwrite policy-authoritative state.

## Duplicate Evidence

The exact stored provider update was submitted to the production webhook a
second time. The response identified it as a duplicate and scheduled no work.
Counts before and after remained unchanged:

- messages: 2;
- agent runs: 6;
- signals: 2;
- risk transitions: 0;
- alerts: 1;
- briefs: 1;
- Telegram inbox events for the provider update: 1.

## Dashboard Refresh Evidence

The authenticated production dashboard was opened in the existing caregiver
Chrome session and then fully refreshed. Before and after refresh it showed:

- three authorised seniors;
- Mr Tan Ah Hock selected;
- current risk Yellow;
- latest response on 15 July at 3:43 pm;
- one active follow-up item;
- the persisted mobility, appetite, and routine priority case.

This proves the Telegram result survives refresh through the existing
authenticated dashboard read path. The dashboard did not use a Telegram-only
view or a separate demo persistence path.

## Commands And Checks

Commands were run with secret values loaded only inside temporary processes.
The relevant non-secret command forms were:

```bash
npm run validate
vercel env add <telegram-variable> production --sensitive
vercel deploy --prod
telegram setWebhook / getWebhookInfo diagnostics
live Supabase event-trace and duplicate-count verification
```

The Supabase migration
`20260715062325_telegram_demo_continuity.sql` is functionally present remotely:
the live identity and inbox tables accepted the verified identity and live event,
and the production service read and updated those rows. A final CLI migration
history listing could not be repeated because this shell has no
`SUPABASE_ACCESS_TOKEN`; no migration was added or changed during live
verification.

## Validation

Final post-evidence `npm run validate` passed:

- Vitest: 74 files passed, 2 skipped; 321 tests passed, 20 skipped;
- TypeScript: passed with `tsc --noEmit`;
- ESLint: passed;
- Next.js production build: passed, including the Telegram webhook, processor,
  simulator, privacy, and data-deletion routes.

## Limitations

- Telegram is a continuity/demo transport, not the intended Singapore senior
  adoption channel.
- Telegram acceptance does not prove message delivery or reading.
- Only inbound text and one senior-facing text reply are in scope.
- Caregiver/family Telegram fan-out, proactive scheduling, media, groups, and
  caregiver Telegram login remain out of scope.
- Meta WhatsApp remains implemented but externally blocked by Meta account lock
  error `131031` and linked Facebook account recovery.
- Production identity onboarding is currently an administrator operation; a
  dedicated onboarding UI is future work.

## Gate Status

**Gate 3T Telegram Demo Continuity: complete for its approved bounded scope.**
