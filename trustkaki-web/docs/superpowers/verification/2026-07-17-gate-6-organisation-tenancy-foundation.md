# Gate 6 Organisation Tenancy Foundation Verification

Date: 2026-07-18
Status: Complete and live verified

## Scope

Gate 6 adds a minimal organisation-tenancy foundation for AAC operations. Each
senior has one owning organisation. Active organisation administrators and
staff can access seniors in their organisation, volunteers additionally require
an explicit senior assignment, and family caregiver links remain direct and
senior-specific. Production administration is derived from active `org_admin`
membership; `demo_admin` remains limited to demo and simulator routes.

Roster management UI, organisation provisioning UI, profile photos, deployment,
and broader multi-organisation operations are outside this gate.

## Implemented Baseline

- `organisations` and `organisation_memberships` have constrained roles,
  lifecycle state, RLS, and no authenticated browser writes.
- Every existing senior was deterministically assigned to the stable demo AAC
  organisation before `organisation_id` became required.
- The one-time administrator backfill uses trusted Auth app metadata. Existing
  AAC volunteer assignments are backfilled as volunteer memberships.
- Private, non-recursive `SECURITY DEFINER` helpers use an empty search path,
  fully-qualified relations, active organisation and membership checks, and
  authenticated user identity.
- Family access is independent of organisation lifecycle. Volunteer access
  requires both active same-organisation membership and an explicit assignment.
- Contact, context, recipient-preview, and proactive-schedule administration
  require active organisation administration. Object-ID contact mutations are
  authorized transactionally inside the existing RPCs.
- Server sessions validate caregiver, membership, and senior rows with Zod and
  derive accessible and administrable senior IDs from authenticated RLS reads.
- Demo reset and Telegram/WhatsApp simulator routes retain separate demo
  authority.
- A shared exact-project guard protects Gate 5 and Gate 6 live setup and cleanup.

## Commits

```text
e6279b9 docs: plan gate 6 tenancy foundation
8e66da6 feat: add gate 6 tenancy schema and rls
bd03d22 feat: derive organisation roles in authenticated sessions
4686ccc feat: authorize production admin routes by organisation
264bfbb test: prove gate 6 tenant isolation and revocation
741a1c3 fix: make gate 6 auth cleanup retryable
f33f573 fix: use valid gate 6 check-in fixture status
```

Design baseline: `6c8dca7`.

## Non-Live Verification

Focused Gate 6 security verification passed 7 files and 34 tests. It covered
the migration contract, production route boundaries, project guard, typed
session derivation, fail-closed errors, and admin route behavior.

Final complete validation:

```bash
npm run validate
```

Result:

- Vitest: 93 files passed, 5 live-gated suites skipped; 583 tests passed and
  38 skipped.
- TypeScript: passed with `tsc --noEmit`.
- ESLint: passed.
- Next.js production build: passed and generated 23 static pages.

The build emitted the existing multiple-workspace-lockfile warning. It did not
fail compilation or validation.

## Migration Evidence

The exact-project guard accepted only the expected linked project ref and
Supabase hostname. Before mutation, linked migration history was aligned
through Gate 5 and showed exactly one unapplied migration. The dry run listed
only:

```text
20260717173000_gate_6_organisation_tenancy_foundation.sql
```

That migration was applied with `supabase db push --linked`. The final linked
migration list shows matching local and remote entries through
`20260717173000`.

## Live Tenancy Evidence

The guarded Gate 6 suite ran successfully three times with fresh fixtures:

```text
Run 1: 4/4 passed
Run 2: 4/4 passed
Run 3: 4/4 passed
```

Each run proved:

- organisation administrators and staff saw only their active organisation;
- volunteers saw only explicitly assigned seniors;
- direct family access remained senior-specific and survived organisation or
  unrelated membership deactivation;
- membership and organisation deactivation immediately revoked derived access;
- message-table RLS inherited the same tenant isolation;
- a demo-only user had no production organisation access;
- only the owning organisation administrator could create a senior contact;
- cross-tenant, staff, volunteer, family, and demo-only mutations returned
  authorization denial and created no contact or audit row;
- database and Auth cleanup completed before suite exit.

An initial network-restricted runner attempt could not reach the Data API and
performed no successful fixture setup. The first network-enabled setup then
identified an invalid synthetic check-in enum value. The fixture was corrected
to the typed `active` value in `f33f573`; that failed setup completed cleanup and
is not counted in the three successful runs.

## Regression Evidence

The existing authenticated caregiver RLS suite passed 10/10. Its first run
proved the committed update through authenticated polling but missed one
provider Realtime event after subscription. A single diagnostic repeat passed
the Realtime assertion and all other tests; no persistent RLS failure remained.

The combined Gate 4 proactive check-in and Gate 5 memory suites passed 14/14.
They preserved schedule authorization, lifecycle behavior, retry and stale
conflict handling, immutable context events, tenant isolation, and cleanup
under required organisation ownership.

## Database Checks

Linked database lint completed with no Gate 6 error-level finding. It reported
the existing `reset_trustkaki_demo` text-to-UUID assignment warning, which
predates Gate 6.

Linked Supabase security and performance advisors each reported no error-level
issues.

A final bounded residue check returned zero Gate 6 synthetic organisations,
seniors, caregivers, and Auth users. The live suite also verifies its exact
temporary IDs and marker-based rows during cleanup.

No email, UUID, senior content, destination, phone number, Telegram identifier,
WhatsApp identifier, token, provider payload, credential, or secret is recorded
in this document.

## Decision

Gate 6 is complete and live verified. Organisation ownership, role separation,
revocation, direct family access, volunteer assignment, production admin
authorization, inherited RLS, cross-tenant partial-write prevention, migration
history, advisors, full validation, and cleanup all passed.

No deployment or Git push was performed as part of this verification.
