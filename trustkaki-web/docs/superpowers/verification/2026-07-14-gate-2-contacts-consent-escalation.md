# Gate 2 Contacts, Consent, and Escalation Verification

Date: 14 July 2026

## Status

Implementation, live database verification, authenticated browser proof, and
independent-audit remediation pass. Gate 2 is ready for independent re-audit
and does not send notifications.

## Implemented

- Admin-only multi-contact plan and method commands.
- Masked caregiver contact-plan reads.
- Immutable consent and contact-plan audit events.
- Deterministic priority, verification, consent, category, and quiet-hour rules.
- Consent-bound urgent quiet-hours override.
- Atomic escalation action, queue update, and recipient decision.
- No outbound notification or claim of delivery.
- Fictional contact plans for all three demo seniors.
- Realtime refresh hints with authoritative API/polling fallback.

## Database Evidence

- Applied migrations: `20260714053148`, `20260714055223`, `20260714060530`,
  `20260714064523`, `20260714070638`, and `20260714071108`.
- Local and remote migration history aligned.
- Seed execution produced four demo contacts, four methods, and four consent
  events. All destinations are fictional.
- Three consecutive live Gate 2 runs passed, followed by one strengthened
  two-admin run after contact-table Realtime publication was added; each run
  passed six tests.
- Live checks covered admin-only mutation, non-admin isolation, idempotency,
  actor attribution, destination preservation, consent replay authorization,
  quiet-hours exclusion, urgent override, stale rollback, actor/assignee/
  recipient separation, and one non-delivery escalation decision.
- Supabase security advisor: no error-level issues.
- Supabase performance advisor: no error-level issues.

## Repository Validation

Command: `npm run validate`

- Tests: 257 passed, 20 skipped live-by-default tests.
- Typecheck: passed.
- Lint: passed.
- Production build: passed.

## Browser Evidence

The temporary admin authenticated successfully. The dashboard API and masked
contact-plan API returned HTTP 200. The browser then proved:

- Mr Tan and Mdm Lim displayed separate senior-specific contact plans.
- Destinations appeared only as `•••• 0001` and `•••• 0011`; raw numbers were
  absent from rendered content.
- `Verify and record consent` persisted through the real admin APIs and the
  refreshed plan included all permitted categories.
- `Preview family alert` selected the first verified, consented contact.
- Senior switching was responsive and loaded the correct relationship, channel,
  quiet hours, and consent state.
- A stale preview message initially survived senior switching. The contact-plan
  component is now keyed by senior ID, and browser re-verification confirmed the
  preview/settings state resets on selection change.

Urgent quiet-hours bypass is verified by the repeated live database suite rather
than a separate UI button. The temporary browser user, consent/audit records,
and credential file were removed, and seed ownership references were restored.

## Remaining Evidence

Independent Gate 2 re-audit. Gate 2 must not be described as accepted until
that review passes.

## Independent Audit Remediation

On 14 July 2026, the first Gate 2 audit identified command-replay binding,
recipient-explanation, Realtime-test, and destination-validation gaps. The
additive migration `20260714064523_gate_2_audit_remediation.sql` bound each
contact/method command ID to the authenticated actor and normalized payload.
Phone destinations require E.164 format after safe normalization; email
destinations are trimmed, lowercased, and validated.

The repository now preserves deterministic `skipped_reasons`, and the admin
preview names the configured masked contact method with plain-language exclusion
reasons. No raw destination is added to the response or audit summary.

Live verification after migration:

- migration dry run listed only `20260714064523_gate_2_audit_remediation.sql`;
- migration applied successfully and local/remote histories align;
- Gate 2 live suite passed three consecutive runs, 9/9 each, followed by one
  final 9/9 run with changed-payload assertions across create/update commands;
- Realtime proof uses the signed-in Supabase client and requires the actual
  `senior_contacts` update event;
- bounded polling fallback is exercised by an independent update without using
  the Realtime event result;
- security advisor: no error-level issues;
- performance advisor: no error-level issues.
- `npm run validate`: 257 tests passed, 20 live-by-default tests skipped,
  typecheck passed, lint passed, and the production build passed.

## Private Command-Binding Remediation

The follow-up audit correctly rejected the public unsalted MD5 fingerprint as a
phone-number enumeration risk. Migration
`20260714070638_gate_2_private_command_bindings.sql` supersedes that design:

- the public `payload_fingerprint` column and MD5 helper are removed;
- normalized payload bindings are stored only in `trustkaki_private`;
- payload equality uses HMAC-SHA-256 with a random 32-byte database-held key;
- public, anonymous, authenticated, and service-role access to the key and
  binding tables is revoked;
- legacy public fingerprints are dropped rather than copied into private data;
- legacy command IDs without a private binding are rejected on replay.

Migration `20260714071108_gate_2_private_binding_cleanup.sql` removes existing
test orphans and adds a deferred cascading foreign key to immutable public audit
records. This preserves same-transaction binding reservation while ensuring
retention and fixture cleanup remove the corresponding private metadata.
Its first application attempt found the expected pre-constraint test orphans and
rolled back; after adding the explicit orphan cleanup, the migration applied
successfully and local/remote history aligned.

Live verification passed 10/10: command replay behavior remains intact, changed
payloads and actors are rejected, Realtime and polling proofs pass, the private
schema cannot be read through the Data API, and the removed public fingerprint
column cannot be selected.

Final security and performance advisor checks reported no error-level findings.
Final `npm run validate` passed 257 tests, with 20 live-only tests skipped by
default; typecheck, lint, and the production build passed.
