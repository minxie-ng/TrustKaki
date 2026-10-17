# Scheduled memory indexing retries — 15 October 2026

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


## Scope and source

Owner requested the next memory reliability slice: scheduled indexing retries with
batch limits, backoff and attempt caps. Only the memory cron is in scope. Existing
outbound channels, Supabase schedules and webhooks are unchanged.

Runtime commit: `a208a00d284ac4e0f30eaec1f9c6eeffcaad8f41`.
Candidate: `dpl_DLK2uZdWJHh36Gcz1Y4KskjL2Fyj`, production target, Ready, `sin1`.
URL: https://trustkaki-1esn3mvab-minxie-ngs-projects.vercel.app.
Previous verified production: `dpl_HtpjiTdLCvcNWi5A88xxyYfpZZZy`, commit `4a262ac`.

## Verified implementation

- Atomic bounded claims with row locks/SKIP LOCKED and two-minute leases.
- Five attempts per version; delays 15/30/60/120/240 minutes. Failures retain
  eligibility time; process death recovers after lease and backoff expire.
- New source versions reset retry state; command replay does not.
- Publication fences scope, source version, lease token, lease expiry, model and
  active/unindexed state. Corrections/archives cannot be overwritten by late work.
- Claims exclude missing provenance, expired and future-confirmed sources.
- Narrow SECURITY DEFINER discovery function, fixed search_path, public execution
  revoked, NOLOGIN owner with explicit RLS. Runtime login cannot assume that role;
  unscoped runtime reads still return zero. Completion stays scoped.
- Foreground and background code share claims. Worker route uses CRON_SECRET,
  fails closed, ignores caller batch limits, processes at most ten facts, and
  exposes aggregate counts only. It invokes no channel-processing code.

## Validation

Regression was first observed red: a provider failure caused an immediate second
read to call the provider again. It passes with durable backoff.

Full suite: **995 passed, 38 skipped**, 141 files passed, 5 skipped. Typecheck,
lint and standard build exited 0. Hosted standard build passed. Initial full run
found the old empty-cron configuration assertion; it was updated to allow exactly
the new daily memory job while preserving existing Supabase scheduler assertions.

Independent review found no Critical or Important issue in privileges, RLS,
concurrency, cancellation, cost bounds or migration-first compatibility.

Normal expiring rehearsal branch `br-summer-boat-b3x79y3t` was created from
production. Migration 002 and live permission/recovery checks passed there, then
the additive migration was applied to production. Rehearsal and production smoke
both exited 0 with these booleans true:

```text
restrictedRoleCannotBecomeWorker, unscopedReadZero, providerFailureBackoff,
crashLeaseRecovered, staleLeaseRejected, fiveAttemptCap, replayPreservesCap,
correctionResetsCap, realEmbeddingRecovery, fictionalFixturesCleaned
```

Each smoke verified two current real-provider embeddings, then removed its random
fictional records/revisions/receipts and asserted zero remaining rows. Existing
facts were not edited. Temporary branch removal and production retention verified.
The old production app continued passing public smoke after the additive migration.

Candidate protected health/legal endpoint equivalents passed; health returned
commit `a208a00d284a`, Neon enabled and reachable. Worker without authorization
returned 401. Production cron secrets are not downloadable through env pull;
the temporary env copy was removed, no secret was rotated, and Vercel's own cron
trigger will be used for the authorized hosted invocation after promotion.

The first candidate generated-reply run rejected a correct singular “noodle soup”
because the assertion required “noodles”. The local verification regex now accepts
both whole-word forms. This changed the verification script only, not hosted
runtime or prompts. Fixture cleanup completed on the failed run.

The corrected generated-reply rerun exited 0: all three real LLM replies passed
without fallback, with the injection-bearing note present. Authenticated read,
unauthenticated/foreign-senior denial, extraction into Neon only, semantic retrieval,
caregiver correction, exact retries, stale-editor conflicts, archive exclusion,
old-extraction non-resurrection and fictional fixture cleanup all passed.

## Production completion — 15 October, 14:52–14:54 Singapore

The owner signed in on the exact candidate. Read-only UI verification loaded all
three fictional seniors, the selected priority case, human follow-up and supporting
care context. Normal caregiver view showed no technical traces or admin controls.

`vercel promote` exited 0 and reported promotion of
`dpl_DLK2uZdWJHh36Gcz1Y4KskjL2Fyj`. Inspection of the public alias resolved to that
same Ready deployment; production health returned `a208a00d284a`, status ok and
personal-memory database reachable.

```text
npm run release:smoke -- https://trustkaki.vercel.app
PASS /api/health
PASS /privacy
PASS /data-deletion
RELEASE SMOKE PASSED

vercel crons list
1 cron job: /api/internal/memory/process-pending, 15 0 * * *

vercel crons run /api/internal/memory/process-pending
Cron job triggered, invocation time 2026-10-15T06:52:41.240Z

vercel logs [exact deployment, memory route, bounded time filter]
14:52:41 GET /api/internal/memory/process-pending 200
```

All commands exited 0. The hosted protected worker completed successfully through
Vercel's trigger, using the existing secret without exposing or rotating it. This
verifies a manual platform invocation; the next natural daily tick has not yet
been observed. Real embedding recovery was separately verified in the production
DB smoke above. No outbound channel processing was invoked.

The daily memory schedule is now active. The previous verified Neon deployment
remains the rollback target. Rehearsal branch, temporary credentials copy and failed
raw-response log were removed; fictional fixture cleanup passed. Documentation-only
commit `8a1c110` updated the smoke matcher/evidence after runtime staging; no runtime
redeploy was needed.

## Operating limits

One Vercel daily schedule: `15 0 * * *`, nominal 08:15 Singapore. Hobby execution
has hourly scheduling precision, so the exact minute is not guaranteed. Maximum
ten sources (each at most 2,000 characters) per scheduled run. Foreground attempts
remain bounded at twenty. Five attempts is a per-version cap, not a dollar budget;
existing provider spending controls remain necessary. Terminal pending facts need
review and an intentional correction/reconfirmation to create a new version.

No claim of instant recovery, infinite throughput or automatic provider-budget
enforcement. Restore and historical-copy retention remain separate follow-ups.
Official schedule limits: https://vercel.com/docs/cron-jobs/usage-and-pricing.
