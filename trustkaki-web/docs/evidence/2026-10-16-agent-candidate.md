# Agent consolidation staged candidate

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


16 October 2026, Singapore. Owner approved deployment of commit
`410b6ef9eba2df2af1b2b04b1cf031009d8364fb` using existing Production settings and
`--skip-domain`. Owner subsequently approved promotion and read-only production
smoke; the exact candidate is now promoted (see final checkpoint below).

## Deployment

- Project: `minxie-ngs-projects/trustkaki`.
- Deployment: `dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR`, target Production, READY.
- Candidate: https://trustkaki-d43286d65-minxie-ngs-projects.vercel.app
- Uploaded an exact Git archive: all 470 tracked app files matched the approved
  commit. No local `.env.local` was copied or uploaded.
- Vercel deployment metadata `githubCommitSha` matches the approved full SHA;
  `sourceSnapshot` is `git-archive`. `vercel inspect` omits these metadata fields,
  so they were checked through the read-only deployment API.
- Remote `npm run build` passed: compiled successfully, TypeScript completed,
  24 static pages generated, build completed, deployment READY.
- Vercel assigned the team alias `trustkaki-minxie-ngs-projects.vercel.app` despite
  `--skip-domain`. The main `trustkaki.vercel.app` remained healthy on
  `a208a00d284a`, with Neon memory enabled and reachable.

## Read-only checks

Credential-free `npm run release:smoke` failed at `/api/health` because Vercel
Deployment Protection intercepted the request. Protection was left enabled.
Equivalent release assertions through authenticated `vercel curl` passed:

```text
PASS /api/health: 200 application/json; 3.88s
PASS /privacy: 200 text/html; charset=utf-8; 2.26s
PASS /data-deletion: 200 text/html; charset=utf-8; 2.28s
AUTHENTICATED VERCEL SMOKE PASSED
```

Health assertions included app, operational database, model configuration,
Neon memory enabled/reachable and embedding configuration. These checks do not
exercise model inference, semantic retrieval or writes. No response bodies were
saved. No messages or database mutations were made by these checks.

An additional version assertion failed because `/api/health` reports an empty
commit: the archive build's empty `VERCEL_GIT_COMMIT_SHA` takes precedence over
the supplied fallback. Source matching and Vercel metadata establish provenance;
runtime version reporting remains a limitation of this candidate.

## Signed-in read-only dashboard check

After owner sign-in and explicit read-only approval, the exact candidate loaded
three expected fictional seniors. Priority ordering, selected-case risk, reason,
recommended human action and supporting care rendered. Two case timelines opened;
existing history, recommendation basis and personal-context sections rendered,
including the intended fictional preferences. Existing historical replies were
not treated as generated-output evidence for this candidate. No case update,
memory change, message, reset or outbound action was performed.

The account exposes the Live system demo navigation, which is gated by demo-admin
status in AppShell/NavBar. This verifies the designated demo account, not normal
caregiver permissions. Cross-caregiver isolation and normal-role control hiding
are not established by this browser check. Historical empty-evidence state in one
case was displayed; no new evidence was generated to populate it.

Earlier, the public fictional walkthrough introduction opened successfully;
returned without starting the workflow or resetting data.

## Ordinary-caregiver checks and fixture cleanup

Owner separately approved two temporary accounts, eight isolated public-table
rows, access checks and cleanup. Checked the same exact candidate and Supabase
project before setup. Each account used a distinct fictional senior and temporary
organisation, with one ordinary family-caregiver link and no admin membership.

Both accounts passed:

- Supabase RLS roster contained only the assigned fixture senior.
- Candidate dashboard returned only that senior and empty technical traces.
- Explicit dashboard/context reads of the other senior returned HTTP 403.
- Own context read returned HTTP 200.
- Admin-context POSTs for own and other senior returned HTTP 403 with an empty
  body, testing authorization before mutation parsing, without a valid write.
- Normal browser sign-in rendered exactly one assigned senior and no Live system
  demo control; both accounts signed out through the UI.

Browser automation used independent headless contexts, not the owner's browser
profile. Candidate-origin requests were forwarded through existing authenticated
`vercel curl` access; Supabase sign-in used the normal UI. No protection settings
changed, and credentials remained in process memory/restricted local recovery
state rather than command arguments or evidence.

First attempt: API checks passed, browser timed out; full fixture cleanup and
former-token denial passed. The retry added bounded diagnostics and explicitly
closed the care-setup drawer before sign-out. All API/browser assertions passed.
The retry runner still exited 1 because its extra administrative sign-outs after
UI sign-out returned errors. Cleanup continued. An independent read-only final
verification exited 0:

```text
PASS independent cleanup verification: eight public rows absent;
two Auth users return 404; two former tokens return 401;
restricted recovery manifest removed.
```

There are no remaining fixtures from either attempt. No existing record was
edited, no model call or outbound message was made, and no schema/policy changed.
The fixture accounts had no messages/sessions/traces: empty trace responses do
not independently test removal of a populated trace; non-empty suppression has
existing offline route coverage. The live write-denial assertion covers the
admin-context gate, not every application mutation endpoint.

## Production promotion

Owner separately approved promotion and read-only production smoke on 16 October
2026, Singapore. `vercel promote dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR` exited 0:

```text
Success! trustkaki was promoted to
trustkaki-d43286d65-minxie-ngs-projects.vercel.app
(dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR)
```

No rebuild occurred. Read-only Vercel lookup of `trustkaki.vercel.app` resolves to
that exact READY deployment and full approved SHA. An initial metadata assertion
expected the main hostname in the deployment's `alias` array and failed; the API
returned only the team alias there. Domain-based deployment lookup and CLI inspect
both confirmed the correct deployment; no additional alias mutation was made.

Credential-free production smoke exited 0:

```text
PASS /api/health
PASS /privacy
PASS /data-deletion
RELEASE SMOKE PASSED
```

Additional read-only health assertions passed: Neon personal memory enabled and
reachable, embedding and LLM configuration present, operational database reachable.
These are configuration/connectivity checks, not fresh inference or retrieval
benchmarks. Runtime health's blank commit-label limitation remains; Vercel metadata
and exact source matching establish the release identity.

Any further bounded mutation or channel test requires its corresponding approval.
