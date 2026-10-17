# Final hosted memory confirmation

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Status: original attempt failed with a memory conflict; owner-approved diagnostic
retry passed on `6992b79`. Both attempts fully cleaned. Owner subsequently
approved promotion with no additional testing; completed successfully. See
[final release evidence](../evidence/2026-10-17-combined-ui-jev-candidate.md).

## Execution result

One HTTP request completed with status 200. Actual active Jev routing and its
declining social decision passed; requested/executed specialists were
`context_memory` and `aac_nudge`. One selected reply matched the reviewed refusal
reply, final policy remained green, no alerts, provider fallbacks or trace errors.
Conversation persistence reported true, but personal memory reported attempted 1,
accepted 0, rejected 0, failed 1: stage `rpc`, category `conflict`.
The memory acceptance criterion failed; no accepted Neon preference was proven.

Stopped without an HTTP retry. Retained budget: one dispatch and US$0.319795
reserved against this separate US$1 cap; this is a conservative reservation,
not a measured provider bill. Earlier budgets remain unchanged.

Scoped Neon records/revisions/commands and Supabase fixtures/generated records,
private receipts and audit events are removed. The context-event trigger was
restored and verified. Exact Auth account absence and former-token HTTP 401
were verified; scoped Neon counts were zero again. Private response, credentials
and cleanup SQL were removed; restricted budget ledger remains.

The grouped error does not establish the originating conflict. The raw response
and sanitized trace did not retain the candidate intent needed to infer it.
Local content-free conflict labels now distinguish application-layer causes;
database-command PT409 errors and cross-store purpose collisions have separate static labels. This is diagnostic work, not a
fix or a successful hosted recheck. Further deployment/inference needs approval.

## Exact scope

- Candidate commit `708f9cf232256158a36a204e5f9ba61db6a6e6be`.
- Deployment `dpl_gr3Gj6MWG6GostFGP8SrSY3Fm4KB`.
- URL https://trustkaki-902kzg48v-minxie-ngs-projects.vercel.app
- Expected Vercel project `prj_NTaTnEXYioGb3C4zy64zOqaTBECj` and Supabase
  project `mbzolhqtcbdfosifjkmd`.
- Public promotion remains outside this checkpoint.

Reuse the bounded procedure, provider/source bounds and guarded cleanup in
[hosted inference check](2026-10-17-hosted-jev-inference-check.md), with only
these reductions: one ordinary temporary account, one organisation, one
caregiver, one fictional senior and one senior-caregiver assignment. Exactly
four setup rows; no memberships, contacts, recipients, schedules or identities.
Fresh senior has age 75, fictional living situation and green risk. Keep IDs,
credentials and responses out of chat, Git and command arguments; save a
restricted recovery manifest before setup and each returned Auth ID immediately.

## Single case

Use exactly one normal-chat POST to `/api/agents/orchestrate` with a fresh
clientMessageId and this fictional message:

> No thanks, I don't want to join any activities today. Please remember that I prefer quiet one-to-one chats.

This repeats the previous incomplete acceptance case on the build containing
the reviewed vocabulary correction. No ambiguity/recipe rerun or recall call.

Acceptance requires:

1. HTTP 200, one nonempty selected reply, no provider fallback/error.
2. Actual active Jev routing, actual Jev social decision declining; the reply
   respects refusal. Human review of the reply in memory remains required.
3. Deterministic policy final risk remains green, without alerts or emergency
   instructions. No unconfirmed persistence promise in the selected reply.
4. Persistence reports true, memory accepted >= 1 and failed = 0. Read scoped
   Neon records to confirm the accepted preference; no personal copy in
   Supabase senior_memories. Inspect only generated-senior messages/runs/audit
   categories needed for these assertions; record counts/pass-fail only.

Stop on any failure. No automatic HTTP retries, second senior or replacement
case. A rejection remains a failed acceptance check even if the reply is safe.

## Budget and preflight

Fresh cap: US$1 total; one persisted reservation of US$0.319795 before dispatch,
using the same conservative per-flow bound and same-day pricing references in
the existing procedure. Earlier ledgers/reservations remain unchanged. Never
refund failure, timeout or uncertain dispatch. At most 14 chat/decision provider
attempts (bounded internal OpenAI retries included), plus the procedure's
bounded embedding allowance; no external HTTP retries.

Before writes, verify READY exact source/project, Supabase identity, Neon health,
OpenAI GPT-4o-mini, Jev and Pinecone embedding configuration provenance. No secret
values printed or copied into evidence. Stop on changed/untraceable provider
configuration or an existing incomplete manifest/ledger. Keep the immutable
dispatch reservation after cleanup; remove temporary credential/response state.

## Cleanup and evidence

Use the existing guarded cleanup transaction design with the saved single
senior ID, organisation and caregiver instead of a three-ID set. Never broaden
deletion by prefix. Validate exact markers/mappings and unexpected dependencies
before deletion. Revoke the temporary session; wait until at least 90 seconds
after any dispatch before cleanup so a timed-out request cannot write afterward.

Delete only scoped Neon records/revisions/commands. Supabase owner cleanup
includes generated context/orchestration private bindings and context audit
events, then exact parents with their normal FK cascades. If needed, temporarily
disable only the named context-event append-only trigger inside the guarded,
locked transaction; restore and verify before commit. Do not disable the frozen
personal-memory guard or touch any key/HMAC table. Verify row absence and restored
trigger, exact Auth user absence and former-token denial. Recheck Neon scope.
Retain restricted recovery state if cleanup is incomplete; stop release work.

Record source/deployment, one attempted/completed case count, bounded routing,
reply review, persistence/Neon and cleanup outcomes, reservation and any failure.
No raw reply, trace payload, credentials or Auth identifiers in tracked evidence.
This confirms one regression example; it is not a semantic-recall benchmark or
a general model-quality claim. Promotion needs its separate owner approval.

## Approved diagnostic recovery — passed; cleanup complete

Deploy the reviewed conflict-label change with existing Production settings and
`--skip-domain`, after read-only linked-service/configuration and exact-source
checks. Public smoke must pass before fixture setup. This is diagnostic only;
the original failure is not fixed or attributed yet.

If separately approved, repeat exactly the single case and four-row/account
fixture procedure above on that deployment. Retain the first failed reservation;
reserve another US$0.319795 before dispatch in the existing ledger. Cumulative
reservation US$0.639590, at most two HTTP attempts including the original, same
US$1 total cap. No automatic HTTP retries; stop on any further failure.

Inspect only the resulting `personal_memory_conflict` event's fixed reason labels
for this candidate/request window, alongside the scoped checks already listed.
Do not print raw log lines, source payloads, identifiers or provider errors.
Apply the same guarded cleanup, token/account absence and Neon zero-count checks
even on failure. No existing-record edits, real messages or promotion. Separate
authenticated release gates remain required before any later promotion.

Owner approved commit `6992b79` deployment and one explicit retry under the same
US$1 cap. READY deployment `dpl_FyG8szAcZgYYiqt7tXbCL2iFKp8Y` at
https://trustkaki-bvkiopp8f-minxie-ngs-projects.vercel.app contains the exact source.
Remote build completed in 36 seconds; local validation passed 1,275 tests,
38 skipped, typecheck, lint and build. All 41 migration versions align. Metadata
and variable-name inspection passed; no configuration was changed. Credential-free
health returned 200; protected health/privacy/deletion smoke passed. Public domain
was verified on its prior release.

The single retry passed HTTP 200, actual active Jev routing and declining social
intent, reviewed refusal reply, green final policy, no alerts/fallbacks/trace
errors, persisted conversation and accepted Neon personal preference. Scoped
verification found no personal-memory copy in Supabase, two persisted messages
and actual stored Jev traces; ordinary caregiver dashboard suppressed traces.
The verifier initially used a nonexistent senior_id on agent_runs (42703);
corrected to the check_ins foreign-key join and completed read-only verification.
No chat was repeated to correct that verifier defect.

The prior memory conflict did not recur. No originating cause is established and
no conflict rule was relaxed. This is one passing regression example, not proof
of general model reliability or a recall benchmark. Two attempts total retain
US$0.639590 in reservations against the existing US$1 cap; provider bill unmeasured.
No promotion was performed.

Cleanup completed: scoped Neon records/revisions/commands and Supabase fixtures,
generated records, private receipts and audit events removed; context-event
trigger restored and verified. Auth account absence and former-token HTTP 401
confirmed, Neon counts zero again. Private response/credential/cleanup files
removed; budget retained. First Supabase cleanup tool request returned an expired
request-state error; the repeated guarded cleanup completed successfully. No
unresolved fixture residue remains. No further chat request or diagnostic-log
inspection was needed after successful verification.
