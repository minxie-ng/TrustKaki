# Two-caregiver candidate check

Status: owner approved and bounded checks completed. Two attempts were cleaned;
no fixture remains. [Results and runner limitations](../evidence/2026-10-16-agent-candidate.md).

## Target

- Candidate commit: `410b6ef9eba2df2af1b2b04b1cf031009d8364fb`.
- Deployment: `dpl_4yfi39CYn2gtnHN5r9p7fJrSbCbR`.
- URL: https://trustkaki-d43286d65-minxie-ngs-projects.vercel.app
- Supabase project: `mbzolhqtcbdfosifjkmd`, checked against the existing project
  guard before any setup operation. Recheck candidate metadata before testing.
- Production promotion is outside this approval.

The release runbook requires ordinary-caregiver isolation and hidden technical
traces/demo-admin controls. The existing owner account is a demo admin. Existing
Gate 6 tests supply the fixture/cleanup pattern, but their broader six-account
live suite is not needed for this check and will not be run.

## Temporary setup

Create exactly:

- Two Auth users, random passwords, fictional `example.com` email addresses,
  confirmed through the admin API without sending email. No demo-admin claim.
- Two caregiver rows linked to those users.
- Two fictional senior rows, each in its own temporary organisation.
- Two organisation rows and two senior-caregiver links, one assigned senior per
  caregiver, using the ordinary family-caregiver role.

Total: two Auth users and eight public-table rows. Unique random run marker and
preallocated UUIDs identify every owned row. No organisation memberships,
contacts, schedules, check-ins, messages, queue cases or Neon memories are needed.
Existing fictional seniors remain unmodified. Credentials and tokens stay out of
chat, command arguments, screenshots, evidence and Git. Any necessary recovery
manifest is local, restricted to the owner and removed after verified cleanup.

## Checks

1. Use each ordinary account against the exact protected candidate with existing
   Vercel authentication; keep protection enabled. Assert `/api/dashboard/state`
   returns only that account's assigned fictional senior and no technical traces.
2. Request the other fixture senior explicitly through dashboard state and
   `/api/seniors/{seniorId}/context`; require HTTP 403 for both accounts.
3. Request the allowed fixture senior context; require HTTP 200.
4. Verify Supabase client row-level reads reveal only the assigned fixture senior.
   Privileged setup credentials must not be used for these assertions.
5. Check the admin context POST endpoint rejects both ordinary identities with
   HTTP 403 before body processing. An empty JSON body avoids introducing a valid
   mutation if authorization regresses. This tests the admin authorization gate,
   not every care-workflow write route. No model call or memory write is intended.
6. Sign in through the candidate's normal UI with each temporary account and
   confirm the assigned roster and absence of Live system demo/technical controls.
   Keep separate browser sessions or use sequential sign-out/sign-in.

Stop on unexpected access. Do not repair production permissions as part of this
check. Existing offline tests remain separate evidence, not substitutes for the
live checks above. No paid provider calls, outbound messages or case actions.

## Cleanup, including partial failure

Track created objects immediately. Revoke each temporary account's sessions while
its token is available. Remove only the two fixture links, two seniors, two
caregivers and two organisations by recorded IDs, checking marker/ownership first;
then delete the two temporary Auth users. Attempt all remaining cleanup steps if
one fails. Revoke/delete operations apply only to this run's generated accounts.

Verify all eight public rows and both Auth users are absent. Recheck a former
temporary token against the candidate: it must be denied. Do not assume user
deletion alone revokes an already-issued JWT. If cleanup is incomplete, retain the
restricted recovery manifest, report bounded outstanding counts and stop release.

Evidence records candidate ID/SHA, pass/fail and aggregate fixture/cleanup counts
only. No credentials, Auth UUIDs, message text, payloads or tokens. Existing
production aliases, settings, schema, RLS policies and services stay untouched.
