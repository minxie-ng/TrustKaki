# Jev hosted candidate — 16 October 2026

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


## Status

Candidate deployed; not promoted. Signed-in demo dashboard and ordinary-caregiver
candidate verification passed. Hosted inference remains pending.
This record supplements the local implementation evidence and does not change
the source of the deployed build.

The owner explicitly approved copying the locally saved OpenRouter key into
Vercel Production as a sensitive secret, enabling Jev, deploying the reviewed
commit with `--skip-domain`, inspecting metadata and read-only public smoke.
No paid model calls, application fixture writes or outbound messages were run.

## Identity and configuration

- Project: `minxie-ngs-projects/trustkaki`.
- Commit: `9a90107da775cd442d574f96443afec157553ce7`.
- Source: exact Git archive of that commit; no local environment file included.
- Deployment: `dpl_9TfmyjgC3FQjkwzB8DqypT6ABYgj`.
- URL: https://trustkaki-6o3zokjc4-minxie-ngs-projects.vercel.app
- Target: Production; state READY; functions in `sin1`.
- Added `OPENROUTER_API_KEY` through stdin, without printing its value.
- Added `TRUSTKAKI_JEV_ENABLED=true`; retained the existing provider credit limit.
- Metadata `githubCommitSha` matches the approved commit.
- No callbacks, webhooks or schedules were edited.

Deployment command:

```text
vercel deploy --prod --skip-domain --yes --scope minxie-ngs-projects --meta githubCommitSha=9a90107da775cd442d574f96443afec157553ce7
Build Completed in /vercel/output [30s]
Deployment completed
readyState: READY
```

## Checks

```text
npm audit --omit=dev
found 0 vulnerabilities

PASS /api/health HTTP 200
PASS /privacy HTTP 200
PASS /data-deletion HTTP 200
PASS hosted Jev enabled/configured; model typesafe/jev-1.14
PASS /api/agents/aac-nudge HTTP 200
```

Direct credential-free smoke failed at health because deployment protection
intercepted the request (a separate status check returned HTTP 302). Used the
existing signed-in `vercel curl` path instead; protection settings were unchanged.
The first CLI wrapper failed because CLI 54.14.5 forwarded `--scope` to curl.
Removed that argument and used the verified local project link; all checks above
then passed. Response bodies and authentication material were not saved.

Build emitted npm configuration/install-script warnings but completed successfully.
The configuration GET proves enabled settings, not a successful hosted Jev inference.
An authenticated end-to-end model check remains pending separate authorization.

## Public domain

After candidate creation, read-only metadata confirmed `trustkaki.vercel.app`
still resolves to `dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR`, commit
`410b6ef9eba2df2af1b2b04b1cf031009d8364fb`.
The CLI assigned the project/team alias to the candidate; the public judge
domain was not promoted. Promotion remains a separate approval checkpoint.

## Signed-in demo dashboard

Owner signed in and explicitly authorized read-only inspection on this exact URL.
Confirmed the signed-in workspace, three expected fictional seniors, selected
case risk/priority, surfaced reason, recommended human follow-up, contextual
preferences and chronological evidence timeline. Expanding the timeline was a
view-only action. No case update, model call, message or record edit was made.
This demo-admin session does not establish ordinary-caregiver isolation or prove
a new Jev inference; historical timeline replies are not evidence of that.

## Ordinary-caregiver access checks and cleanup

Owner separately approved repeating the fixture counts, assertions and cleanup in
`../operations/2026-10-16-caregiver-release-check.md`, targeting this candidate
`dpl_9TfmyjgC3FQjkwzB8DqypT6ABYgj` and commit
`9a90107da775cd442d574f96443afec157553ce7` instead of the earlier release.
Created two temporary ordinary Auth accounts and eight isolated fictional public
rows in the guarded Supabase project. Each account passed:

- RLS roster and candidate dashboard contained only its assigned fixture senior.
- Dashboard traces were empty; foreign dashboard/context reads returned 403.
- Own context read returned 200; own/foreign admin context POSTs with empty JSON
  returned 403, before valid mutation input was supplied.
- Normal browser UI sign-in showed exactly one assigned senior and no Live
  system demo, Agent reasoning or Run details controls.
- Care setup context expanded read-only, with no Save context control.
- UI sign-out returned to the sign-in form.

Browser interactions used CUA on the exact protected candidate with existing
Vercel authentication. The owner demo-admin session was signed out to switch
roles; the candidate tab is now signed out. Temporary credentials were read from
a restricted local document without emitting its contents and entered through
the normal login UI. The document was closed, credential variables cleared and
the local credential/recovery files removed after cleanup. Initial TextEdit
launch timed out; selecting its subsequently opened window resolved this.

```text
PASS project and candidate identity
PASS bounded setup: two ordinary Auth users and eight isolated rows
PASS caregiver 1: scoped RLS/dashboard, empty traces, foreign reads and admin writes denied
PASS caregiver 2: scoped RLS/dashboard, empty traces, foreign reads and admin writes denied
PASS cleanup: eight fixture rows and two Auth users absent; former tokens denied
```

Cleanup exited 0: all eight rows and two Auth users were independently queried
for absence, and both former access tokens were denied by the candidate. UI
sign-outs had already revoked the browser sessions; cleanup also attempted
administrative revocation of the separate API sessions. No fixture remains.
No paid model calls, outreach, existing-record edits or promotion occurred.

Limits: fixtures contained no populated agent traces, so empty live trace results
complement existing offline populated-trace suppression tests. The write-denial
probe covers the admin context boundary, not every mutation endpoint. The empty
senior UI displays existing presentation defaults (including age and AAC contact);
these defaults are not newly verified personal facts.
