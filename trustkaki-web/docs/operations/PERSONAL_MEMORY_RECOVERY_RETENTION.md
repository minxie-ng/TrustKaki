# Personal-memory recovery and retention

<!-- documentation-context -->
> **Operator reference.** This document defines controlled procedures and prerequisites. It is not a product tour or an instruction to run live commands during judging. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


Updated 15 October 2026. Recovery drill passed; owner approved the exact cleanup and it was applied.
Production verification passed; remaining backup/erasure limits below still apply. [Evidence](../evidence/2026-10-15-memory-recovery-retention.md).

## Recovery available today

Project `floral-hall-40623128`, root/default branch `production` has
`history_retention_seconds=21600` (six hours), on Free. This is a rolling history
window, not an independent long-term backup. Free history is also capped at 1 GB;
do not promise a guaranteed six-hour recovery point under every write volume.
See [Neon history limits](https://neon.com/docs/postgres/backup-restore/history-window).

Recovery rehearsal creates two branches from a recorded production LSN, empties
only the disposable damage copy, then verifies a new recovered copy against the
pre-loss fingerprints of facts, vectors, revisions and command receipts. It checks
the restricted runtime login, RLS and scoped vector search, removes both temporary
branches, and verifies production is still present and unchanged. It never rewinds
production or changes application connection strings. Branches expire after one hour
as a cleanup backstop. No embedding or chat-provider calls are made.

From the app directory, with existing ignored environment configuration and an
authenticated Neon CLI:

```sh
node --env-file=.env.local --import tsx scripts/neon-memory-restore-smoke.ts \
  --confirm-live --confirm-disposable-branches
```

This drill is restricted to the current fictional demo corpus, at most 1,000 rows
per table. Before using it with real senior data, choose an authorised recovery
environment and its access/retention rules; a normal branch contains source data.

## Incident procedure

1. Record the affected deployment, scope and last known good time/LSN. Stop affected
   personal-memory writes and the memory worker through the release incident process.
2. Inspect current project history availability. Recover into a new isolated branch
   from a point inside retained history. CLI `branches create --parent <LSN>` uses
   the default branch: verify its ID/name first. Explicit API `branch.parent_id` plus
   `branch.parent_lsn` is an alternative when the default differs. Never guess a
   production restore command. See [Neon CLI branching](https://neon.com/docs/cli/branches).
3. Reconcile canonical facts, source versions, vectors/model, revisions and command
   receipts. Recheck runtime permissions, unscoped/foreign-senior denial and scoped
   retrieval. Check for legitimate writes after the recovery point before replacing
   anything; whole-database rewind could lose those writes.
4. **Reapply all erasure/archive/correction decisions made after the recovery point
   before recovered data serves users.** A backup may contain earlier personal text.
   Obtain those decisions from trusted records outside the restored timeline. If
   they cannot be reconstructed, keep recovered data isolated and escalate to the
   owner. A separate durable erasure register has not been implemented.
5. Prepare the exact cutover and rollback plan, then obtain the release approval for
   production writes/credential changes. Validate the signed-in app and generated
   replies on that exact recovered candidate. Resume the memory worker only after
   reconciliation and checks pass. Existing outbound channel jobs need their own
   incident approval; this procedure does not invoke them.
6. Remove authorised temporary recovery copies. Record only counts, booleans,
   deployment IDs and timings, never recovered text, credentials or personal IDs.

The rehearsal's elapsed time is a small-dataset measurement, not an incident RTO
or an independent-backup restore test. Recovery after the six-hour window, account
loss or provider loss remains unverified. Before a real-user pilot, agree recovery
objectives and configure/test an appropriate longer history or encrypted independent
backup. No paid upgrade or backup destination was configured in this slice.

## Historical-copy inventory and proposed retention

| Copy | Verified state | Proposed handling |
| --- | --- | --- |
| Supabase personal `senior_memories` | 5 reviewed legacy rows removed; 0 remain; guard enabled | Completed 15 October after owner approval. |
| Related Supabase `senior_context_events` | 4 reviewed events scrubbed; snapshots null, reason/key replaced | Metadata retained; cleanup complete. |
| Supabase operational context | 1 family contact route; 1 related snapshot event | Preserve; operational data remains in Supabase. |
| Other memory audit events | 2 null-context events without snapshots | Preserve unless separately reviewed; no blanket event deletion. |
| Neon canonical memory | 4 records (3 current vectors), 4 revisions, 7 receipts | Canonical source; existing archive/erasure behavior applies. Do not prune versions or receipts arbitrarily. |
| Neon recovery history | Rolling 6-hour setting | Keep current setting for fictional demo; account for historical copies during erasure and recovery. |
| Pinecone historical pilot | Earlier evidence records a retained fictional namespace | Review exact pilot namespaces before deletion; live inventory not checked in this slice. Keep inference credentials/service working. |

The owner selected “Prepare cleanup now”, then approved execution of the exact
proposal on 15 October. [Applied migration](../../supabase/migrations/20261015071528_purge_legacy_personal_memory_copies.sql)
is recorded remotely under version `20261015071528`; the local filename matches.
Do not rerun it. It is an exact historical cleanup, not a reusable general purge.

The transaction allowlisted five memory IDs and four audit-event IDs with full-row
change checksums, locked both tables, and refused changed inventory/trigger state.
MD5 was an optimistic change detector, not authorization. Both protective triggers
were restored in the same transaction. Four events retained metadata while snapshots
were cleared and reason/context-key text was replaced with fixed purge labels.
Postconditions checked unrelated rows/events byte-for-byte. Post-commit checks found
0 personal legacy rows, 1 operational row, 4 scrubbed events, 7 total memory events,
1 remaining operational snapshot and both protections enabled. Neon fingerprints
matched before/after; production public smoke passed.

Three local PGlite tests cover successful cleanup, changed-snapshot refusal and
postcondition rollback. Rejected/null-context events, old Pinecone pilot vectors,
provider backups and other historical copies remain outside this exact cleanup.

Keep content-free reconciliation evidence (counts/checksums/result booleans) in
version control. Do not create extra raw-data exports merely to delete redundant
copies. Existing provider backups, traces/messages, local pilot artifacts and any
other copies need their own inventory/retention review before claiming global
erasure. Deleting canonical text cannot promise immediate removal from provider
history or erase data held outside this application.
