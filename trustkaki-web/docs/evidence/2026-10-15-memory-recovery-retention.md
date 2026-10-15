# Memory recovery and retention checkpoint — 15 October 2026

## Scope

Owner approved the next restore/retention slice after the indexing release. Only
disposable recovery branches were mutated. Production memory and legacy Supabase
data were read for verification; no retention deletion, production restore,
credential change, paid upgrade, provider call or outbound message was performed.

## Recovery proof

Neon project metadata: `floral-hall-40623128`, Free, history 21,600 seconds.
Root/default production branch: `br-hidden-bird-b3xbfqzo`. Existing direct and
runtime connection hosts matched that branch's read-write endpoint before use.

Command:

```sh
node --env-file=.env.local --import tsx scripts/neon-memory-restore-smoke.ts \
  --confirm-live --confirm-disposable-branches
```

Successful run output (exit 0):

```json
{"passed":true,"historyRetentionSeconds":21600,"recoveredRecords":4,"recoveredRevisions":4,"recoveredReceipts":7,"currentVectors":3,"damagedCopyEmpty":true,"historicalRecoveryMatched":true,"scopedVectorRead":true,"unscopedAndForeignDenied":true,"productionUnchanged":true,"elapsedSeconds":6,"temporaryBranchesRemoved":true}
```

The drill pins a production WAL LSN; a damage branch from that point was emptied.
A second branch was recovered from the same historical production point. Exact
SHA-256 fingerprints of all three tables (including vectors and retry/receipt
state) matched baseline. All three RLS tables retained enabled/forced policies;
the restricted login could not become the index-worker role. Unscoped/foreign
reads returned zero and scoped vector search found its expected fact. Production
fingerprint remained unchanged; temporary branches were removed and their absence
checked. No copied data was exposed to the application.

Initial harness attempts used unsupported create syntax `branch@LSN`; both failed
before creating a branch. Official CLI documentation specifies `--parent <LSN>`
against the default branch. The script now verifies production is default and uses
that syntax. The unused preliminary branch was also removed. The final script adds
a 1,001-row overflow guard and attempts cleanup of every created branch even if a
previous deletion fails; its final rerun also exited 0 with the same counts/booleans, elapsed 7 seconds.
Typecheck and focused ESLint both passed. Full app tests/build were not repeated
for this standalone operational script and documentation change.

## Read-only retention inventory

Existing dry-run backfill command passed: 5 personal legacy rows, 4 canonical groups,
1 imported historical revision and 1 operational row. Legacy snapshot digest:
`728547084c54d01bb78ab40a360d2a0b27a29ec99e09fffab1ff6c54fe622d87`.
The legacy missing-evidence count describes the old frozen copy, not current Neon
confirmation state; the three owner-confirmed fictional facts remain current.

Aggregate SQL verified:

- 5 frozen personal rows, 1 operational row; freeze guard enabled.
- 4 related personal-memory audit events, all with snapshots.
- 7 total memory audit events, 5 with snapshots. The other snapshot belongs to
  operational context; the 2 unmatched/null-context events have no snapshots.
- Audit events are append-only by existing migration. No trigger was disabled.

Pinecone pilot evidence says its fictional namespace was retained. It was not
queried or deleted during this checkpoint. No current namespace-count claim made.

## Production and limits

Public smoke after the drill exited 0: `/api/health`, `/privacy`, `/data-deletion`
all PASS, `RELEASE SMOKE PASSED`. No application runtime change or redeploy needed.

This proves recovery into an isolated historical branch and SQL/vector/access
verification for the small demo corpus. It does not prove a production failover,
restoration from an independent backup, an RTO/SLA, recovery beyond available
history, or post-restore erasure replay. No full UI/LLM rerun was needed because
the production deployment and its data did not change.

[Recovery runbook and proposed retention](../operations/PERSONAL_MEMORY_RECOVERY_RETENTION.md).
## Review-only cleanup prepared

Owner selected “Prepare cleanup now”. Supabase CLI created versioned filename
`20261015070533_purge_legacy_personal_memory_copies.sql`; it was moved outside the
active migration directory into `docs/operations/proposed-migrations/` before editing.
It is not queued for `db push` and has not been applied.

The proposal allowlists 5 memory rows and 4 related events with full-row checksums,
locks both tables, refuses changed inventory or trigger state, removes only the
reviewed rows and replaces the events' snapshots/reason/context-key text with purge
markers. Event metadata remains. Unrelated rows/events are compared byte-for-byte;
all temporary trigger exceptions are restored within the atomic transaction.

Three focused PGlite tests passed: exact cleanup and protections, changed-row
refusal, and rollback restoring data/protections after a forced postcondition failure.
Typecheck and ESLint passed. An initial rollback-test string substitution collapsed
SQL dollar quoting; fixed the local test callback, then all three passed. The first
sandboxed CLI attempt could not resolve npm; network-authorised CLI retry created
the file successfully. No live cleanup or protection change was attempted.

Execution of this irreversible cleanup remains unapproved. Independent review found no
Critical or Important issue and independently reran all three focused tests.
Recovery-script source review found no additional blocker. Production data remains
unchanged. Temporary local metadata copies were removed.
