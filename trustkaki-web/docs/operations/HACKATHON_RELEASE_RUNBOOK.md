# TrustKaki Hackathon Release Runbook

## Scope And Owner

This runbook covers the bounded TrustKaki hackathon release and judge demo. It
is not approval for a controlled AAC pilot, clinical use, or enterprise
operations.

The project owner is the release operator for the hackathon only. The operator
owns the checklist, requests each approval, stops on a no-go condition, keeps
the bounded release record, coordinates rollback, and confirms cleanup. Access
to Vercel, Supabase, Telegram, Meta, or authenticated judge accounts remains
limited to the people already authorized for those systems.

Every bounded release record excludes tokens, Auth UUIDs, phone numbers,
Telegram identifiers, raw destinations, provider identifiers, and provider
payloads.

No live inspection, deployment, webhook change, schedule change, outbound
message, rollback, or cleanup begins without explicit approval for that
checkpoint. Approval for one checkpoint does not authorize the next.

## Stop Conditions

The decision is no-go, or an active release is stopped, when:

- core health is degraded;
- deployed commit does not match the approved commit;
- caregiver or senior isolation fails;
- a secret, raw destination, provider identifier, or payload leaks;
- normal caregivers receive technical traces or demo-admin controls;
- deterministic policy is bypassed or memory changes risk directly;
- both Telegram and WhatsApp controlled message paths fail;
- rollback cannot restore the last verified deployment;
- any Critical or Important final-audit finding remains unresolved.

The operator records only the failed checkpoint and a bounded reason, pauses
further activity, and moves to Incident Response. A single unavailable
transport is not by itself no-go when the other controlled path passes and the
judge workflow remains intact.

## Pre-Deployment

1. Select the exact commit proposed for the demo and identify the last verified
   deployment available for rollback.
2. Confirm the diff has completed independent review or keep the release no-go.
3. Run the local, non-live checks:

   ```bash
   npm run validate
   npm audit --omit=dev
   ```

4. Record pass/fail, test counts or warnings, the proposed commit SHA, and the
   last verified deployment ID. Do not record credentials or response bodies.
5. **Approval checkpoint:** obtain explicit approval before any linked Supabase
   inspection. After approval, compare migration history without applying it:

   ```bash
   npx supabase migration list --linked
   ```

6. If migration history is unexpected, stop. Do not push, repair, or modify the
   linked project during this checkpoint.

## Required Configuration Names

Verify names and presence only; never print, copy into the release record, or
compare secret values in a shared terminal or document.

Core judge path:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `TRUSTKAKI_LLM_API_KEY`
- `TRUSTKAKI_LLM_BASE_URL`
- `TRUSTKAKI_LLM_MODEL`
- `TRUSTKAKI_LLM_TIMEOUT_MS`

Telegram fallback and scheduler:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_WEBHOOK_SECRET`
- `TELEGRAM_INTERNAL_PROCESSOR_SECRET`
- `CRON_SECRET`

WhatsApp restoration path:

- `WHATSAPP_ACCESS_TOKEN`
- `WHATSAPP_PHONE_NUMBER_ID`
- `WHATSAPP_BUSINESS_ACCOUNT_ID`
- `WHATSAPP_VERIFY_TOKEN`
- `WHATSAPP_GRAPH_API_VERSION`
- `META_APP_SECRET`
- `TRUSTKAKI_DEMO_SENIOR_PHONE`
- `WHATSAPP_INTERNAL_PROCESSOR_SECRET`

Production must leave `ENABLE_WHATSAPP_DEV_SIMULATOR` and
`ENABLE_TELEGRAM_DEV_SIMULATOR` unset. `ENABLE_FULL_AGENT_REPLAY` is optional
and should remain unset for the primary judge path.

## Deploy And Public Smoke

1. **Approval checkpoint:** obtain explicit deployment approval for the selected
   commit. Deploy it to preview using the project's established Vercel workflow;
   do not change callbacks, webhooks, or schedules.
2. Record the preview deployment ID and deployed commit SHA. Never record tokens,
   Auth UUIDs, phone numbers, Telegram identifiers, or payloads.
3. **Approval checkpoint:** obtain separate approval before inspecting the live
   Vercel project. Then inspect deployment metadata and verify the SHA matches
   the approved commit:

   ```bash
   export TRUSTKAKI_RELEASE_URL=https://trustkaki.vercel.app
   npx vercel inspect "$TRUSTKAKI_RELEASE_URL"
   ```

   Use the preview URL in `TRUSTKAKI_RELEASE_URL` until promotion is approved;
   the URL above is the production example.
4. Run the credential-free, non-mutating public smoke:

   ```bash
   npm run release:smoke -- "$TRUSTKAKI_RELEASE_URL"
   ```

5. Record endpoint pass/fail and time only. Do not save response bodies.
6. Continue to authenticated verification on preview. **Approval checkpoint:**
   promote the verified deployment only after public smoke and authenticated
   judge verification pass. Record the promoted deployment ID and commit SHA,
   then rerun public smoke against the production URL.

## Authenticated Judge Verification

**Approval checkpoint:** obtain approval to use the designated judge account and
fictional demo records. Keep credentials out of commands, screenshots, and the
release record.

On the deployed commit:

1. Sign in through the normal UI and confirm the expected fictional seniors are
   visible.
2. Confirm one caregiver cannot read or mutate an unrelated caregiver's senior.
3. Confirm a normal caregiver sees neither technical traces nor demo-admin
   controls.
4. Run the bounded judge workflow only if demo mutation was approved: select the
   priority case, inspect the reason and recommended human follow-up, record an
   outcome, resolve it, and confirm active queue removal with history retained.
5. Confirm deterministic policy remains the final risk authority and memory
   context neither diagnoses nor changes risk directly.

Record deployment ID, commit SHA, checkpoint pass/fail, bounded counts, and
time. Never record tokens, Auth UUIDs, phone numbers, Telegram identifiers, raw
destinations, provider identifiers, payloads, message text, or technical traces.

## Telegram Demo Verification

The 15 July 2026 evidence proves a bounded production Telegram path for its then
deployed commit; it does not approve the final selected release commit.

**Approval checkpoint:** approve one pre-agreed fictional message, recipient,
and time window before sending. Verify webhook acceptance, one policy-controlled
reply, persistence, exact-update deduplication, and authenticated dashboard
refresh on the final selected commit. Do not use personal or sensitive content.

Record only deployment ID, commit SHA, pass/fail, bounded event/reply counts,
and time. Do not record Telegram identifiers, payloads, message content, or
destinations. If Telegram fails, stop transport changes and assess the already
approved WhatsApp checkpoint; if both controlled paths fail, the release is
no-go.

## WhatsApp Restoration Attempt

WhatsApp restoration is a bounded hackathon attempt, not production Meta or AAC
pilot approval. Do not recreate Meta assets or bypass account recovery,
credential, consent, signature, quiet-hour, recipient-selection, or policy
controls.

**Approval checkpoint:** obtain separate approval before accessing Meta,
changing a callback, replacing a credential, invoking the protected retry
processor or other recovery processing, or sending one fictional controlled
message. Use only the valid account-recovery and signed-webhook path. Verify at
most one inbound-to-policy-to-reply flow and bounded delivery status handling.

Record only deployment ID, commit SHA, pass/fail, bounded counts, time, and a
sanitized provider error category if blocked. Never record tokens, phone
numbers, destinations, provider identifiers, payloads, or message text. A
blocked WhatsApp attempt may use verified Telegram as the hackathon fallback;
it does not authorize a production claim.

## Rollback Rehearsal

Prefer a preview rehearsal. **Approval checkpoint:** obtain approval before any
Vercel promotion or rollback; production rollback requires its own explicit
approval.

Use this order:

1. Identify the last verified deployment ID and its commit SHA from the bounded
   release record.
2. Pause further release activity. Do not restore webhook or schedule activity.
3. Promote the last verified deployment, or roll back to it, through Vercel's
   established deployment controls.
4. Set `TRUSTKAKI_RELEASE_URL` to the restored URL and rerun public smoke:

   ```bash
   npm run release:smoke -- "$TRUSTKAKI_RELEASE_URL"
   ```

5. Rerun the authenticated read-only checks for sign-in, expected fictional
   senior visibility, isolation, normal-caregiver UI boundaries, and unchanged
   deterministic-policy authority.
6. Only after Steps 4 and 5 pass, request separate approval to restore any
   webhook or schedule activity. Returning to the new release also requires
   separate approval and repeated smoke and authenticated checks.

Record deployment IDs, commit SHAs, pass/fail, time-to-restore, and bounded
failure categories only. If the last verified deployment cannot be restored,
the release remains no-go.

## Incident Response

1. Stop the demo or release at the first stop condition. Do not retry outbound
   actions blindly.
2. The release operator records the time, affected checkpoint, deployment ID,
   commit SHA, user-visible impact, and a bounded category. Do not capture
   credentials, identifiers, destinations, payloads, message content, or raw
   logs in the release record.
3. For suspected secret, destination, identifier, payload, or cross-senior
   leakage, stop access and outbound activity, preserve restricted evidence in
   its approved system, and notify the credential/data owner. Rotation or data
   handling requires that owner's separate approval.
4. For application failure or wrong commit, follow Rollback Rehearsal ordering.
   Public smoke and authenticated read-only checks must pass before any webhook
   or schedule activity resumes.
5. For a transport-only failure, stop that transport and use the other path only
   if it already passed its controlled verification. Both paths failing is
   no-go.
6. Resume only after the issue is bounded, required owners approve, and every
   applicable stop condition is cleared. Record the decision and approver.

## Cleanup

**Approval checkpoint:** obtain approval before cleanup that changes live data,
accounts, webhooks, schedules, or credentials.

After the demo or aborted release:

1. Pause any temporary fictional schedule and confirm no approved test work is
   pending before removing test fixtures.
2. Remove only the explicitly approved fictional records and temporary access
   created for the checkpoint; preserve required audit history.
3. Restore only the previously recorded webhook and schedule state. Do not make
   unrelated configuration changes.
4. Revoke temporary judge access or credentials through their owning systems
   when applicable; never place their values in the record.
5. Confirm no synthetic payloads, pending retries, screenshots containing
   identifiers, or locally saved response bodies remain.
6. Record cleanup pass/fail and bounded counts. Escalate uncertain ownership or
   residue rather than deleting it.

## Go Or No-Go Record

Complete one bounded record for the selected release:

```text
Release date/time:
Release operator:
Approved commit SHA:
Preview deployment ID:
Production deployment ID:
Last verified rollback deployment ID and commit SHA:
Local validation and dependency assessment: PASS / FAIL
Migration history inspection: PASS / FAIL / NOT APPROVED
Public smoke: PASS / FAIL
Authenticated judge verification: PASS / FAIL
Telegram final-commit verification: PASS / FAIL / NOT APPROVED
WhatsApp restoration attempt: PASS / FAIL / BLOCKED / NOT APPROVED
Rollback rehearsal: PASS / FAIL / NOT APPROVED
Cleanup: PASS / FAIL / PENDING
Critical or Important final-audit findings open: YES / NO
Stop conditions present: YES / NO
Decision: GO FOR HACKATHON DEMO / NO-GO
Approver and approval time:
Bounded caveats (no identifiers, destinations, payloads, or secrets):
```

`GO FOR HACKATHON DEMO` requires every applicable checkpoint, rollback, cleanup
plan, and final audit to support go, with no stop condition present. It means
hackathon demonstration only; it does not approve a pilot or production care
service.
