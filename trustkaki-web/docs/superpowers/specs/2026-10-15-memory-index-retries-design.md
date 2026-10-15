# Scheduled personal-memory indexing retries

Owner approved protected scheduling, bounded batches, backoff, attempt caps and
version checks. Execute this slice inline; retain Vercel, Neon and the current
embedding provider. A separate queue service would add an unnecessary dependency;
request-only retries cannot recover idle seniors after an outage.

## Design

Persist attempt count, next eligible attempt, lease token and lease expiry beside
each canonical record. Claim atomically with row locks and SKIP LOCKED. Each
version gets five attempts; delays are 15, 30, 60, 120 and 240 minutes. Leases last
two minutes. Crashed calls consume an attempt and become eligible after both lease
and backoff expire. A correction resets retry state; exact command replays do not.
Current-version embeddings remain the only retrievable vectors.

Use one narrow SECURITY DEFINER claim function for global or single-senior claims.
Its NOLOGIN owner has only SELECT/UPDATE on records and an explicit RLS policy;
the application cannot SET ROLE to it. Revoke public execution, fix search_path,
validate arguments and cap claims at 20. All publication and lease release use
existing scoped application transactions. A token and version fence late workers.
Missing provenance, expired/future facts and other embedding models are ineligible.

Both foreground retries and the scheduled worker use the same claim/backoff path.
The protected route uses existing CRON_SECRET, fails closed, ignores caller batch
parameters and processes at most 10 facts with a 40-second deadline. Responses and
logs contain aggregate counts only. Provider failure releases leases but preserves
backoff; cancellation/cleanup failure relies on lease expiry. No channel workflow
is called. One daily Vercel run at 00:15 UTC (08:15 Singapore) is the initial
schedule; it is not an immediate-recovery SLA. Provider account spending controls
remain necessary; count/character bounds do not enforce a dollar budget.

## Verification and release

Real SQL tests cover access, claim exclusion, overlap, delay/cap, lease expiry,
version reset and stale publication. Unit/route tests cover no-work, provider
failure, timeout and authorization. Rehearse migration on a temporary Neon branch
before production. Run suite/typecheck/lint/build, stage production, verify protected
route and fictional recovery, then promote and verify public smoke. Preserve the
previous verified Neon deployment. Restore and retention are separate slices.
