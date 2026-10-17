# Personal-memory recovery and retention

[Documentation](../README.md) · [Neon operations](../NEON_MEMORY_SETUP.md) · [Validation](../VALIDATION.md)

This operator reference covers personal-memory recovery and historical copies. It does not authorise live commands. Releases, fixture creation, recovery branches and production changes require the corresponding approvals in the [release runbook](HACKATHON_RELEASE_RUNBOOK.md).

## Recovery boundary

The fictional-demo project was recorded with a **six-hour rolling Neon history window** on 15 October 2026. That is a dated observation, not a check of today's configuration or an independent long-term backup. Inspect current history availability and provider limits before any recovery; write volume can shorten the usable window. See [Neon history limits](https://neon.com/docs/postgres/backup-restore/history-window).

The maintained rehearsal creates two disposable branches from a recorded production LSN. It empties only the damage copy, then verifies a recovered copy against pre-loss fingerprints of facts, vectors, revisions and command receipts. It checks the restricted runtime login, RLS and scoped vector search, removes temporary branches, and verifies the production corpus is unchanged. It never rewinds production or changes application connection strings. Branches expire after one hour as a cleanup backstop; no embedding or chat calls are made.

```bash
# From trustkaki-web, only after approving this live recovery drill:
node --env-file=.env.local --import tsx scripts/neon-memory-restore-smoke.ts \
  --confirm-live --confirm-disposable-branches
```

The script deliberately pins the original demo project/branch and verifies the endpoint. It is not a general-purpose restore tool. It is limited to the fictional corpus and at most 1,000 rows per table. A normal recovery branch contains source data; real senior data requires an authorised recovery environment and its own access/retention rules.

## Incident procedure

1. Record the affected deployment, scope and last known good time/LSN. Stop affected personal-memory writes and the memory worker through the release incident process.
2. Inspect current project history availability. Recover into a new isolated branch from a retained point. CLI `branches create --parent <LSN>` uses the default branch: verify its ID/name first. Explicit API `branch.parent_id` plus `branch.parent_lsn` is an alternative when the default differs. Never guess a production restore command. See [Neon CLI branching](https://neon.com/docs/cli/branches).
3. Reconcile canonical facts, source versions, vectors/model, revisions and command receipts. Recheck runtime permissions, unscoped/foreign-senior denial and scoped retrieval. Identify legitimate writes after the recovery point; a whole-database rewind could lose them.
4. **Reapply erasure, archive and correction decisions made after the recovery point before recovered data serves users.** Obtain those decisions from trusted records outside the restored timeline. If they cannot be reconstructed, keep the recovered data isolated and escalate to the owner. A separate durable erasure register is not implemented.
5. Prepare the exact cutover and rollback plan and obtain release approval for production writes/credential changes. Validate the signed-in application and replies on the recovered candidate. Resume the worker only after reconciliation and checks pass. Outbound channel jobs require their own incident approval.
6. Remove authorised temporary recovery copies. Record counts, booleans, deployment IDs and timings; never recovered text, credentials or personal IDs.

The small-data rehearsal does not establish an incident recovery-time objective, independent-backup restoration, or recovery after provider/account loss. An authorised pilot needs agreed recovery objectives and a tested longer history or encrypted independent backup.

## Copy inventory and retention responsibilities

| Copy | Treatment |
| --- | --- |
| Neon facts, vectors, revisions and receipts | Canonical personal memory. Preserve lifecycle/version consistency; do not prune receipts or revisions arbitrarily. |
| Supabase operational context, conversations and care history | Retained for their operational purpose. They are not interchangeable with the Neon personal-memory store. |
| Frozen legacy Supabase personal-memory copies | The reviewed one-time cleanup removed five legacy facts and scrubbed four related audit snapshots on 15 October 2026. This is historical evidence, not a live inventory. |
| Neon history and other provider backups | May contain earlier personal text. Include them in retention planning and post-restore erasure reconciliation. |
| Historical Pinecone pilot vectors | Separate from current inference. Inventory exact old namespaces before any deletion; preserve the inference service used by current embeddings. |
| Local evaluation artifacts, traces and exports | Keep only authorised, necessary evidence. Avoid raw-data exports and extra copies of personal content. |

The [legacy cleanup migration](../../supabase/migrations/20261015071528_purge_legacy_personal_memory_copies.sql) remains in migration history for reproducibility. **Do not rerun it as a general purge.** It allowlisted exact rows, refused changed inventory, preserved unrelated operational records and restored protective triggers transactionally. Local tests retain successful-cleanup, changed-snapshot refusal and rollback coverage.

No universal retention duration or global-erasure guarantee is established. Deleting canonical text cannot immediately remove provider history or copies outside the application. A real-care pilot requires an explicit retention schedule, copy inventory, durable erasure reconciliation and verified deletion/recovery procedures.
