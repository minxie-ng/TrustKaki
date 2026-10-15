# Neon metadata and runtime credential — 15 October 2026

## Completed prerequisite

Canonical source records can now preserve all fields from a legacy senior_memories
row, including editing/extraction metadata and original attribution/timestamps.
The pure mapper requires a caller-resolved org/senior scope; wrong senior, wrong
source message and unsupported excerpts fail. Trusted routing/accessibility tags
remain operational. Family/other records require explicit purpose review. Missing
source evidence is retained as an explicit state and excluded from indexing,
search and final retrieval validation. Stored content is never invented as a quote.
500-character safe-use notes survive a complete SQL round trip and correction.

This changes the JSON contract, not database tables. It does not migrate rows or
switch application readers/writers. Historical fictional fixtures without metadata
remain valid. New production writes must supply metadata through their adapter.

## Live credential and lifecycle proof

A temporary `memory-runtime-check` branch was cloned from production and used
first. SQL created `trustkaki_memory_app` with NOINHERIT and no superuser, CREATEDB,
CREATEROLE, REPLICATION or BYPASSRLS flags. Its only direct membership is the
non-admin `trustkaki_memory_runtime` role. SQL creation avoids the broad
neon_superuser membership granted by Neon's Console/API/CLI role creation.
[Official role documentation](https://neon.com/docs/manage/roles).

Branch setup passed; repeat setup passed without password rotation. The temporary
branch was deleted and its ignored env file removed after verification. Fictional
lifecycle passed through the restricted login. Then selected production branch
setup and fictional lifecycle passed:

```sh
npm run memory:neon:runtime -- --confirm-live
npm run memory:neon:smoke -- --confirm-live
```

Both exited **0**. Raw results:
[credential checks](2026-10-15-neon-runtime-credential.json),
[lifecycle checks](2026-10-15-neon-runtime-lifecycle.json).

Verified:

- New login cannot read personal_memory before SET LOCAL ROLE.
- After selecting runtime role, absent scope returns zero rows.
- No neon_superuser membership or database/public-schema CREATE privilege.
- Schema creation and direct DELETE denied.
- Source and complete metadata round trip, exact replay, concurrent correction
  conflict, scope isolation, stale vector publication rejection, archive, erasure,
  and non-resurrection on old command replay.
- All random fictional artifacts cleaned. No real senior data imported or read.
- Only DATABASE_URL changed atomically in ignored `.env.local`; other settings
  preserved and file mode 600. Direct owner URL retained for migration/cleanup.
- Connection targets/credentials cannot be overridden with pg query parameters;
  only unique sslmode/channel_binding options are accepted.

The role can SELECT/INSERT/UPDATE its scoped tables because the existing
SECURITY INVOKER command function requires those privileges. It does not enforce
append-only history against arbitrary trusted SQL. Scope variables are a server
boundary, not authentication for user-supplied SQL. Deployment env has not been
changed, and the owner direct URL must be excluded from application deployment.

## Local verification and review

- Full regression suite before the final script-only URL guard: **937 passed,
  38 skipped across 139 files**.
- Final focused suite: **154 passed across 10 files**.
- Typecheck and changed-file ESLint passed.
- `npm run build -- --webpack`: exit **0**, compiled in 2.9 seconds, generated
  **23/23** static pages. Default Turbopack's environment restriction was already
  documented in the preceding slice; build configuration was not changed.
- Independent review caught PostgreSQL query overrides taking precedence over
  URL hostname/userinfo. Six tests failed before the guard, then all nine
  credential tests passed. Reviewer verified the fix; no important findings remain
  for this bounded prerequisite. Reviewer did not access env files or live services.

## Application integration still required

Runtime inventory remains:

| Path | Required replacement |
| --- | --- |
| seniorContextRepository | Replace personal-memory query with query-aware Neon retrieval; derive organisation from trusted senior row and preserve operational baselines/health. Covers authenticated agent routes, WhatsApp and Telegram. |
| memoryRepository | Replace personal tag reads, caregiver list/edit/archive and accepted automatic personal writes. Retain operational RPC branches. Preserve exact retry IDs and expected version/timestamp conflicts. |
| orchestrationRepository | Keep stable automatic command IDs on cross-store partial failures; no duplicate write when replaying persisted channel envelopes. |
| patternRepository | Remove personal memory copy from Supabase; optional personal enrichment must not block deterministic care patterns. |
| routes, worker and release | Enforce auth before Neon scope; schedule bounded indexing, test grounded generation/outage/channel behavior, validate export/restore, reconcile classified backfill, freeze and cut over one writer, retire legacy personal reads/writes and copies. |

Local Supabase URL/anon/service placeholders were still blank at verification.
The user was shown where to find them and the ignored env file was opened. This
blocks signed-in integration verification, not the completed credential/metadata
checks. No deployment, live chat generation or production cutover is claimed.
