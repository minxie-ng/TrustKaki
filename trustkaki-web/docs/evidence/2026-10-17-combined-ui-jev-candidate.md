# Combined UI, Jev and memory candidate

17 October 2026 (Singapore). Owner approved exact commit `708f9cf`, linked-service
inspection, candidate deployment and read-only smoke. This does not authorize
model calls, authenticated account use, fixture writes or promotion.

## Source and target

- Source: `708f9cf232256158a36a204e5f9ba61db6a6e6be` from a clean tracked Git archive.
  Local environment files excluded; independent visual/functional review completed.
- Deployment: `dpl_gr3Gj6MWG6GostFGP8SrSY3Fm4KB`, READY, Production target with
  `--skip-domain`, existing configuration unchanged. API metadata confirms exact
  source SHA and expected TrustKaki project. Remote build completed in 45 seconds.
- Candidate: https://trustkaki-902kzg48v-minxie-ngs-projects.vercel.app
- Public domain remains on `dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR` (`410b6ef`).
  Vercel also assigned its generated project alias, as with earlier candidates.

## Checks

- `npm run validate`: 160 test files passed, 5 skipped; 1,273 tests passed,
  38 skipped. Typecheck, lint and production build passed. Initial sandboxed
  tests could not bind localhost; full validation passed outside that sandbox.
- `npm audit --omit=dev`: zero vulnerabilities. Working tree was clean at deploy.
- All 41 Supabase local/remote migration versions match; none applied.
- Required Production variable names/scopes present, including Jev routing,
  OpenRouter and Neon memory settings. Secret values were not printed/read back.
- Direct credential-free smoke was blocked by existing deployment protection.
  Existing authenticated Vercel CLI requests passed the equivalent checks;
  protection settings were unchanged.

```text
PASS exact project/source metadata READY
PASS /api/health HTTP200; operational database and Neon memory readiness
PASS /privacy HTTP200
PASS /data-deletion HTTP200
PASS /api/agents/aac-nudge HTTP200; Jev enabled/configured, no inference
PASS /api/agents/orchestrate GET HTTP200; model configured, no inference
PASS public domain unchanged
PROTECTED CANDIDATE SMOKE PASSED
```

Existing remote npm cache-dir/install-script warnings remain. No live fixtures,
model requests, outbound messages, database mutations or promotion occurred.

## Pending

Remaining hosted preference-memory example; explicit promotion approval. Candidate
readiness does not establish those results. Earlier active Jev hosted checks
remain evidence for their earlier build only. No final-demo readiness claim yet.

## Signed-in demo dashboard — passed

Owner signed in and approved read-only inspection on the exact candidate.
Laptop inspection confirmed three fictional seniors, selected identity, labelled
priority, case reason, recommended action and sourced/dated personal context.
Manrope computed styling and refreshed green controls/panels render on the hosted
build. Judge workspace opens with a disabled empty-message submit control and
historical recorded traces; it explicitly requires a new message to show that
request's retrieval/save outcome. No inference or write was submitted.

The session later returned to sign-in after these checks. Inspection used a
separate tab after the original view changed during review. Temporary viewport
was reset and the review tab closed; the owner's tab was retained. This account
has demo-admin controls, so this check does not establish ordinary-caregiver
restrictions. Screenshot evidence is local and excluded from the release record.

## Ordinary-caregiver isolation — passed; cleanup complete

Owner approved two temporary ordinary caregivers, eight isolated fictional rows,
checks and full scoped cleanup on candidate `708f9cf`. Project/source identity was
rechecked before setup. No memberships/admin claims, messages, schedules or Neon
memory rows were created. Existing records were not edited by the check.

Both accounts passed:

- RLS roster contains only the assigned senior.
- Candidate dashboard returns only that senior, with no technical traces.
- Cross-senior dashboard and context reads return HTTP 403; own context HTTP 200.
- Empty-body admin-context POSTs for own and other senior return HTTP 403.
- Normal browser sign-in shows the assigned fictional senior only; Judge
  workspace, Live system demo and technical controls are absent.
- Sequential A-to-B sign-out/sign-in clears A's senior before B's roster appears.
  Initial loading cleared without an application error. Both accounts signed out.

Setup initially rejected an uppercase fixture slug before creating an account;
planned fixture absence was verified, slug corrected to match the schema, and
checks completed. This was a runner input defect, not a production change.

First cleanup verification raised an assertion; cleanup continued and repeated
its exact-owned-record verification successfully. The runner retains exit 1 from
that earlier assertion. Final verification confirms all eight rows absent, both
Auth users return 404, both former tokens return 401, and the restricted manifest
is removed. No unresolved residue remains. Temporary browser tab closed and
credential bindings cleared. No model call, outbound message or promotion.

Limits: fixtures have no populated traces; suppression of populated traces has
local regression coverage. Write denial covers the admin-context gate, not every
mutation route. Production remains on `410b6ef`.
