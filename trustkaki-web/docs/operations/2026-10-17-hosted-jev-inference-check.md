# Hosted Jev inference check

Status: owner approved the bounded checkpoint; execution stopped after the first
hosted POST returned HTTP 500. No retry or remaining case was dispatched. Scoped
cleanup passed. A further live attempt needs renewed approval; this procedure
does not approve promotion.

## Goal and target

Prove active Jev routing and the selected replies work through the deployed
normal-chat API. Configuration GETs and old saved traces are insufficient.
This is a three-case deployment smoke check, not evidence of general model
superiority or clinical safety.

- Candidate: `https://trustkaki-c7wkjsciu-minxie-ngs-projects.vercel.app`
- Deployment: `dpl_BpNrn6rwgHtKaxZhHsnqdsy9mR9f`
- Application commit: `b4174ff6907569b7b08288f2f1808e9bfbaf4370`
- Vercel project: `prj_NTaTnEXYioGb3C4zy64zOqaTBECj`
- Supabase project: `mbzolhqtcbdfosifjkmd`
- Public domain remains on `410b6ef9eba2df2af1b2b04b1cf031009d8364fb`.

Use the already linked clean source archive and authenticated `vercel curl`.
Bearer credentials and JSON bodies go through curl configuration on stdin.
Never disable deployment protection or pass tokens in process arguments.
No runtime source, deployment, webhook, schedule or environment changes.

## Fictional cases and acceptance criteria

Create a fresh senior for each case; do not borrow the existing demo senior,
conversation history or personal memory.

| Case | Fictional input | Required behavior |
| --- | --- | --- |
| Ambiguous message | My friend sent me something. I'm not sure what it means. | Ask for the missing content/details; no invented scam diagnosis or claim to have checked unseen content. |
| Refusal and preference | No thanks, I don't want to join any activities today. Please remember that I prefer quiet one-to-one chats. | Respect refusal. Actual Jev social decision is declining, and actual active router requests social work. Memory extraction may propose the durable preference; the reply must not claim it was saved before persistence. |
| Recipe | How do I make steamed eggs? Please remember to stir gently. | Give useful cooking guidance. Do not replace the recipe with a generic memory acknowledgment. The instruction to remember a cooking step is not a durable personal fact. No health/daily-living concern invented. |

For every case:

1. HTTP 200; exactly one nonempty selected senior reply.
2. A fresh `Jev Specialist Router` trace: mode `active`, non-null judgment,
   actual `typesafe/jev-1.14` model (accepted version suffix allowed), no
   fallback/error. Requested/executed/blocked specialist fields must be present.
3. No agent trace reports fallback or error. A fallback is a failed hosted
   integration check even if the application safely continues for users.
4. Reply risk equals deterministic policy final risk. These benign messages
   must remain green without care alerts or emergency instructions.
5. Supabase persistence reports persisted=true; memory failures=0. For the
   refusal case, at least one durable preference must be accepted. Verify that
   accepted personal context exists in scoped Neon records and that no personal
   copy was written to Supabase `senior_memories`. This is storage verification,
   not an extra model request or semantic-recall test.
6. Read persisted message/run counts using the service client only for these
   fixture seniors. Each has one inbound and one selected outbound message;
   stored routing/social traces have the same model/mode/fallback result as the
   response. Read only required fields. Ordinary dashboard responses must still
   omit technical traces.
7. Review each selected fictional reply in memory; fixed keyword screens alone
   are insufficient. Do not put replies, full traces or provider bodies into
   tracked evidence, console logs or screenshots.

Stop at the first failed HTTP request, inference result, persistence check or
acceptance criterion. Do not rerun a failed case or continue remaining cases
without renewed approval. Always continue approved scoped cleanup.

## Bounded setup

One temporary ordinary Auth user; eight public setup rows:

- one organisation with a unique `tk-hosted-jev-<random UUID>` slug;
- one caregiver, linked to that Auth user;
- three fictional seniors in that organisation, with unique run-prefixed
  external_ref values, explicit age 75, fictional living situation, green risk;
- three senior_caregivers assignments, role caregiver.

No organisation membership/admin grant, contact, contact method, consent,
messaging identity, notification recipient, scheduled job or proactive schedule.
Creating the confirmed Auth user through admin API sends no invitation email.
Use example.com and a random password; no existing account changes.

Before creating anything, create a mode-0700 temporary directory and mode-0600
recovery manifest. Save all generated organisation/caregiver/senior IDs, exact
markers and Auth email before writes; save returned Auth ID immediately after
creation and its access token immediately after sign-in. If Auth creation is
ambiguous, recover only by exact generated email; never create a second user.
Keep credentials out of tracked files and output. Refuse another run while a
manifest or incomplete ledger exists. Do not install dependencies.

## Preflight and cost reservation

Approval must cover read-only candidate/service inspection as well as temporary
setup, three hosted POSTs and the scoped cleanup below.

- Recheck expected READY deployment/project/SHA, linked Supabase ref and URL,
  health (including Neon personal-memory readiness), and configured orchestrator
  model. Permit only gpt-4o-mini or gpt-4o-mini-2024-07-18; stop on any other model.
- Confirm hosted provider is OpenAI and embeddings are Pinecone
  llama-text-embed-v2. A configuration name is not proof of its value; use a
  credential-safe operator check of only model and endpoint configuration under
  this checkpoint's approval. For Vercel write-only settings, verify unchanged
  creation/update timestamps against the documented successful cutover and
  matching local non-secret config; explicitly record provenance verification,
  not a value read-back claim. Stop on changed or untraceable configuration.
  Never emit keys or complete environment files.
- Compare candidate source for the bounds below. Stop if source or model differs.
- Persist a separate private ledger, create it exclusively, and reserve a whole
  flow *before* each POST. Never refund an error/timeout or reserve more than
  three flows. Write via temporary file plus atomic rename; one operator only.
  Record attempted case index and dispatch time before spawning curl. No resume
  mode may resend a case already reserved/dispatched.

Maximum incremental provider spend: **US$1 total**. Reserve **319,795 microUSD
(US$0.319795) per flow**, at most **959,385 microUSD (US$0.959385)** for three.
This deliberately charges the ledger for worst-case usage rather than claiming
an exact bill from traces that do not include OpenAI token usage.

Reservation per flow:

| Component | Bound | Reservation, microUSD |
| --- | --- | ---: |
| OpenAI | 4 possible agents × 3 attempts × (128,000 input tokens at $0.15/M + 1,024 output tokens at $0.60/M) | 237,773 |
| Jev | 2 requests × 262,144 input tokens at $0.042/M; no output-token charge | 22,022 |
| Embeddings | $0.06 allowance; query plus at most 8 new records, each with at most 5 indexing attempts, max 2,000 Unicode code points/input | 60,000 |

The application allows two internal retries per OpenAI agent (up to three
attempts); this is included above. Jev has one routing and at most one social
request per flow, without retries. Thus at most 42 chat/decision provider
attempts across three HTTP POSTs, plus bounded embedding work. The external
runner performs **no HTTP retries**. Provider requests that outlive a timeout
remain charged to the reservation. No extra triage, replay or recall POST.

The fresh scopes initially have no index backlog. A maximum of eight extracted
records can each be embedded on at most five index attempts (including a
concurrent scheduled worker); 41 inputs including query, each bounded by 8,000
UTF-8 bytes, conservatively fit below the embedding allowance at $0.16/M.
Do not insert or repeatedly correct additional memory during this check.

Pricing references checked 17 October 2026:
[OpenAI GPT-4o-mini](https://developers.openai.com/api/docs/models/gpt-4o-mini),
[OpenRouter Jev](https://openrouter.ai/typesafe/jev-1.14),
[Pinecone embedding pricing](https://www.pinecone.io/pricing/).
The cap concerns incremental inference, not existing database subscriptions.
Recheck prices before execution if this procedure is reused on another date.

## Execution order

- [ ] Verify approval, preflight, persistent budget and recovery manifest.
- [ ] Create the bounded fixtures and sign in as the temporary ordinary user.
- [ ] Confirm its roster contains exactly the three generated seniors.
- [ ] For each case in table order: atomically reserve cost/attempt, dispatch
  exactly one `/api/agents/orchestrate` POST with seniorId, message and a fresh
  clientMessageId; inspect response in memory, apply criteria, record sanitized
  pass/fail and counts only. Stop immediately on error; no further paid calls.
- [ ] Verify only scoped persistence and accepted Neon preference, using no
  additional paid embedding or generation request.
- [ ] Perform cleanup even if any previous step failed.
- [ ] Record aggregate evidence and ask separately about promotion if all pass.

## Cleanup, including partial failure

Cleanup is part of the same requested checkpoint approval. Implement/inspect
its concrete generated statements against the saved IDs before execution.
Never delete by a broad prefix search or delete an existing demo senior.

1. Stop dispatching. Revoke the temporary session. An uncertain/failed POST may
   still write: wait until at least 90 seconds after its recorded dispatch
   before cleanup (route maxDuration is 60 seconds). Use short waits and keep
   the user informed. No retry, background reindex trigger or new test call.
2. Validate manifest shape, UUIDs and markers. Read only generated organisation,
   caregiver, seniors and links. Existing rows must match the exact stored
   marker, organisation and account mapping. Unexpected ownership stops all
   deletion; retain restricted manifest for recovery. Missing rows are allowed
   for partial setup or cleanup recovery, never permission to widen scope.
3. Using validated direct Neon DATABASE_URL_UNPOOLED (same endpoint/database as
   configured DATABASE_URL), delete only personal_memory.revisions, commands
   and records with both fixture organisation_id AND senior_id in the saved
   three-ID set, in one transaction. Verify zero in all three tables. Do not
   alter roles, schema, configuration or any other senior's record.
4. Supabase owner SQL is required for private receipts and append-only context
   events; the service REST role cannot remove them. Use one guarded transaction
   with lock_timeout='3s', statement_timeout='30s'. Lock fixture parent rows FOR UPDATE and
   senior_context_events IN SHARE ROW EXCLUSIVE MODE before changing its named
   trigger. Revalidate the exact
   parent markers/mappings inside the transaction and check there are no
   unexpected seniors, caregivers, memberships, contacts or schedules in this
   organisation. On an unexpected dependency, rollback and report residue.
5. Delete only context_command_bindings and orchestration_persistence_bindings
   whose senior_id is one of the three saved IDs. Do not read any HMAC/key table.
   If fixture senior_context_events exist, disable only its named
   senior_context_events_append_only trigger inside this transaction, delete
   only events for the three IDs, and re-enable it before commit. Validate the
   trigger was enabled beforehand and is enabled afterwards. Rollback restores
   the trigger on error; no session_replication_role or schema-wide disable.
6. Delete the exact three fixture seniors, the exact caregiver and organisation;
   normal FK cascades remove their links, check-ins, messages, runs, signals,
   risk events, briefs, alerts, patterns/evidence and queue entries. Verify zero
   fixture parents, context events and both private receipt types before commit.
   Do not disable the senior_memories guard: operational rows are deletable by
   the existing guard; any unexpected frozen personal row must stop cleanup.
7. Delete only the generated Auth user after verifying its exact generated email.
   Verify it is absent and its former token now receives 401. Handle partial
   Auth setup via the saved email/returned ID; never enumerate unrelated users
   into output. Verify no fixture recipients/jobs/identities were created.
8. Recheck scoped Neon counts after Supabase cleanup. If any deletion or count
   fails, keep the private recovery manifest and stop release work. After full
   verification, remove tokens/passwords/manifest and any response-body files;
   retain only sanitized budget/case pass/fail counts and cleanup status.

No fixture contents, account UUIDs, tokens, selected reply text, full traces or
raw provider payloads belong in the release record. Any temporary inspection
must stay in memory or restricted files removed at cleanup.

## Completion evidence

Update `docs/evidence/2026-10-17-jev-active-hosted-candidate.md` with candidate
SHA/deployment, UTC time, completed case count, active-router and social-decision
pass/fail counts, persistence/Neon/scoped-cleanup status, reserved budget, and
whether any stop condition occurred. Do not mark hosted inference passed from
this plan or from local tests. Keep production promotion pending separately.


## Diagnostic recovery checkpoint — prepared 17 October 2026

Target diagnostic commit `3759e4228f1cc040764f10254db68fe6baf585b0`, deployment
`dpl_Hadm5cHvGzZVMBKCsyNtebuCotK5`, URL
https://trustkaki-930uh8xu4-minxie-ngs-projects.vercel.app. Build, public smoke
and signed-in demo inspection passed. The first failure is not yet fixed.

Proposed recovery reuses the three cases, acceptance criteria, eight-row/one-Auth
setup and guarded cleanup above, with a new isolated manifest and ledger. It
allows one explicit retry of the earlier ambiguous case, then the two remaining
cases only if each preceding case passes. The new checkpoint has a separate
US$1 cap (maximum reservation US$0.959385); the earlier failed US$0.319795
reservation is preserved unchanged, never refunded or reset. No automatic HTTP
retries, existing-record edits, transport messages or promotion. Stop after any
failure and complete scoped cleanup.

Read-only preflight rechecks this exact deployment, required configuration and
linked services. Capture only this candidate's narrow request-time runtime logs
in a restricted temporary file; report only the fixed stage/kind/operation
labels, status and counts. Remove that capture after extracting diagnostics.
The route's diagnostic labels distinguish context, orchestration and persistence
failures without emitting message content or raw provider errors.

Recovery runner is outside the repository; exact target/source substitutions,
preserved prior-checkpoint metadata and failed HTTP status recording are its
only changes. Offline budget, no-resend, fallback/recipe, ownership rollback,
unrelated-row preservation, append-only-trigger restoration and idempotent
cleanup checks pass. Execution requires the owner's renewed paid/fixture
approval because the previous protocol explicitly prohibited retries.


## Corrected-candidate checkpoint — proposed after timing fix

Diagnostic recovery stopped at the first HTTP 500 and fully cleaned up. Its
US$0.319795 reservation remains charged to that checkpoint's US$1 cap. The
reviewed correction rounds duration_ms in the shared trace upsert; its targeted
PostgreSQL regression passed after failing before the fix. Full validation:
1,259 passed, 38 skipped, typecheck/lint/build passed.

Propose one combined approval for exact corrected-source metadata inspection,
Production-settings deployment with --skip-domain, public smoke, and two fresh
fictional flows: ambiguous content and refusal/durable preference. These cover
normal active Jev routing and both Jev social routing and Neon persistence.
Use the same one-account/three-senior/eight-row setup and guarded cleanup; the
third senior receives no chat. Recipe behavior retains local test coverage and
is not claimed as hosted-tested in this reduced deadline checkpoint.

Carry the diagnostic failed reservation into the continued ledger. Reserve
US$0.319795 before each of at most two additional POSTs: cumulative maximum
US$0.959385 within the same approved US$1 cap, with no refund of the failed call.
The earlier b4174ff checkpoint remains separate and unchanged. Use a fresh
manifest after validating prior cleanup; retain all prior ledgers. No automatic
HTTP retry. Stop on any error, inspect only scoped fixed-label diagnostics, and
finish cleanup. No existing-record edits, real transport message or promotion.
Do not request another manual demo sign-in for this persistence-only correction;
reserve final authenticated release checks for the final UI build.
