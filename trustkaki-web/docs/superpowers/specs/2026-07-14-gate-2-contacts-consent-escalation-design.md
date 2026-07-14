# Gate 2 Contacts, Consent, and Escalation Design

**Date:** 2026-07-14
**Status:** Approved design; implementation planning awaits user review

## Purpose

Give TrustKaki an operationally safe answer to: who may be contacted for a
senior, through which verified method, for what reason, at what time, and in
what order. Gate 2 enables recipient selection but does not send notifications.

Pattern Watch and the caregiver queue remain the product differentiator. This
gate is the narrow safety foundation required before multi-recipient WhatsApp
or proactive outreach can be enabled.

## Scope Decisions

- Only authenticated admins may create or change contacts, methods, consent,
  quiet hours, or escalation priority.
- Linked caregivers may view a masked, concise contact plan.
- Consent is an immutable, auditable event with provenance and optional expiry.
- Urgent alerts may bypass quiet hours only when the selected method has
  explicit consent for urgent quiet-hours override.
- Gate 2 selects and records a recipient candidate. It never claims that a
  person, AAC, healthcare provider, or emergency service was contacted.
- Gate 2 does not configure Meta callbacks, send WhatsApp messages, schedule
  check-ins, add memory features, or build a full organisation admin portal.

## Existing Foundation

TrustKaki already has:

- authenticated caregivers linked to seniors through `senior_caregivers`;
- an existing `demo_admin` app-metadata role checked server-side;
- auditable caregiver case actions with separate actor and assignee identities;
- explicit escalation destinations and deterministic policy-authoritative risk;
- conflict-safe, idempotent database commands and shared-caregiver refresh.

Gate 2 must preserve these boundaries. The current `caregivers.phone` and
relationship fields are display-era fields, not sufficient evidence of a
verified, consented notification destination.

## Data Model

### `senior_contacts`

Represents a person or operational contact linked to one senior.

- UUID primary key and `senior_id` foreign key;
- display name and relationship;
- contact kind: `family_guardian`, `aac_staff`, or `healthcare_contact`;
- preferred language and IANA timezone;
- positive integer escalation priority, unique per active senior/contact kind;
- active flag, `created_at`, `updated_at`, and creating/updating admin identity.

The contact is not the authenticated actor or case assignee. A caregiver may
also appear as a contact, but the records remain separate concepts.

### `contact_methods`

Represents one destination for one contact.

- UUID primary key and `senior_contact_id` foreign key;
- channel: initially `whatsapp`, `sms`, `voice`, or `email`;
- normalized destination stored server-side as sensitive PII;
- verification status, method, and timestamp;
- positive integer method priority within the contact;
- local quiet-hours start/end and timezone;
- active flag, `created_at`, `updated_at`, and admin actor metadata.

Ordinary API responses expose only a masked destination. Verification records
that an admin has confirmed the method; it does not perform an OTP flow in this
gate. A future verification provider can update the same model.

### `contact_consent_events`

Append-only evidence for granting, revoking, or expiring consent on one contact
method.

- UUID primary key, senior/contact/method foreign keys;
- event type: `granted` or `revoked`;
- permitted categories:
  `wellbeing_follow_up`, `health_safety`, `digital_safety`, `urgent_safety`;
- urgent quiet-hours override permission;
- confirmation method: `written`, `verbal`, `digital`, or `imported_record`;
- confirmation timestamp, optional expiry, note, and authenticated admin actor;
- client command UUID and `created_at` for idempotency and audit ordering.

Events are never updated or deleted through application APIs. Effective consent
is determined from the latest event for the method. That event must be granted,
unexpired, and contain the requested category; an older grant can never become
effective again because a newer grant expired or was revoked.

### `contact_plan_audit_events`

Append-only administrative history for contact, method, verification, priority,
quiet-hours, activation, and deactivation changes. It stores the admin actor,
command UUID, event type, target IDs, bounded before/after summaries, and time.
Sensitive destinations are masked in audit summaries.

### `notification_recipient_decisions`

Records the output of recipient selection without representing delivery.

- senior, queue item, and optional caregiver-action foreign keys;
- notification category, operational destination, urgency, and evaluation time;
- selected contact and method IDs, or null when none is eligible;
- result: `candidate_selected` or `no_eligible_contact`;
- concise selection explanation and skipped-reason codes;
- `created_at` and command UUID.

This table makes notification recipient identity distinct from action actor and
case assignee. Gate 3 may link an outbound delivery attempt to this decision.

## Authorization and Privacy

- Admin mutation authorization uses trusted `app_metadata.role`, never
  `user_metadata`.
- Public-schema tables have RLS enabled and explicit grants.
- Admins may manage contact-plan rows; linked caregivers cannot directly read
  raw destinations or consent provenance tables.
- A server read model authenticates and authorizes the senior relationship,
  then returns only masked contact-plan data required for caregiver operations.
- Unrelated caregivers receive `403` and no existence-sensitive detail.
- Service-role credentials and raw destinations never enter client bundles,
  logs, traces, audit summaries, or error responses.
- Security-definer functions, if required for one atomic command, use an empty
  search path, fully qualified relations, explicit identity checks, and revoked
  default execution privileges.

## Deterministic Recipient Selection

Selection accepts a senior ID, notification category, operational destination,
urgency, evaluation timestamp, and optional requested channel. It applies these
rules in order:

1. Match active contacts to the requested destination.
2. Require an active contact method matching the requested channel when one is
   supplied; previews without a channel evaluate all active methods.
3. Require verified status and a verification timestamp.
4. Resolve the latest consent event and require granted, unexpired consent for
   the requested category.
5. Exclude methods currently in local quiet hours.
6. For `urgent_safety` only, allow a quiet-hours bypass when that consent event
   explicitly permits urgent override.
7. Sort eligible contacts by escalation priority, method priority, then contact
   UUID and method UUID for stable deterministic output.
8. Select exactly one first recipient candidate and return reason codes for all
   excluded candidates.

Selection never uses an LLM. Repeated evaluation with the same state and time
must produce the same result. If no method is eligible, TrustKaki records
`no_eligible_contact`, keeps the caregiver case visible, and tells staff that
manual intervention is required.

Operational destinations map narrowly:

- `family_guardian` selects `family_guardian` contacts;
- `aac_supervisor` selects `aac_staff` contacts;
- `healthcare_follow_up` selects `healthcare_contact` contacts;
- `emergency_guidance` selects no automated recipient and continues to show
  explicit emergency guidance. Gate 2 never treats 995 as a contact target.

## Transaction and API Design

Admin writes use short, idempotent, conflict-aware database commands. Each
command carries a client UUID and expected `updated_at` version. A stale command
returns HTTP 409 and leaves contact, method, consent, audit, and recipient state
unchanged. Retrying a successful command returns the prior result without a
duplicate audit or consent event.

Focused API surface:

- `GET /api/seniors/[seniorId]/contact-plan` returns the masked caregiver read model;
- `POST /api/admin/seniors/[seniorId]/contacts` creates a contact and audit event;
- `PATCH /api/admin/contacts/[contactId]` updates contact status or priority;
- `POST /api/admin/contacts/[contactId]/methods` creates a method;
- `PATCH /api/admin/contact-methods/[methodId]` updates verification or quiet hours;
- `POST /api/admin/contact-methods/[methodId]/consent` appends a consent event;
- `POST /api/admin/seniors/[seniorId]/recipient-preview` returns a deterministic,
  non-delivery selection preview.

Request schemas are strict Zod contracts. Routes derive the admin actor from the
authenticated session and load senior scope server-side. Raw database/provider
errors are converted to bounded 400, 403, 404, 409, or 500 responses.

When a caregiver records an escalation, the existing short database command
also evaluates and persists the recipient decision in the same transaction as
the immutable action and queue transition. Selection performs database reads
only and makes no external call. If any write fails, action, queue, and decision
state all roll back. The transaction never includes future provider delivery.

## Caregiver and Admin UI

A focused `Contact plan` section appears in the selected senior view.

Linked caregivers see:

- contact name and relationship;
- masked method and verification state;
- permitted alert categories;
- quiet-hours availability;
- escalation order and urgent-override eligibility.

Admins additionally receive one compact edit flow to add or update a contact,
verify a method, record or revoke consent, set quiet hours, and reorder priority.
The panel includes normal and urgent recipient previews with plain-language
eligibility explanations. It does not expose raw IDs, full destinations,
database fields, or technical traces.

Forms prevent double submission, retain one command UUID across network retry,
show pending/success/failure states, and refresh the authoritative read model
after success. Realtime is a refresh hint; bounded polling remains the fallback.

## Testing and Verification

Automated tests must prove:

- admin-only create, update, verify, reorder, consent, and revoke operations;
- authorized caregiver masked reads and unrelated-caregiver isolation;
- raw destinations never appear in caregiver APIs or rendered data;
- immutable consent and audit history with authenticated admin actors;
- idempotent retries and stale-write 409 behavior without partial state;
- inactive, unverified, revoked, expired, category-mismatched, and quiet-hours
  contacts are excluded;
- urgent quiet-hours bypass requires explicit `urgent_safety` consent and
  urgent-override permission;
- deterministic stable ordering and explainable skipped reasons;
- no eligible contact produces a visible manual-intervention result;
- action actor, case assignee, and recipient candidate remain distinct;
- existing caregiver case transitions and policy risk authority remain unchanged;
- two authenticated users observe the updated masked plan through Realtime or
  bounded refresh, while an unrelated caregiver remains isolated.

Verification includes focused unit and route tests, a live Supabase multi-user
suite, admin and caregiver browser workflows, migration dry-run/application and
history alignment, security/performance advisors, secret-leak checks, and
`npm run validate`.

## Exit Criteria

Gate 2 is ready for independent audit only when an admin can configure a real
multi-contact plan, a linked caregiver can safely understand it, deterministic
selection can explain who is eligible and why, consent and quiet-hour rules are
enforced, unrelated users remain isolated, and all live and repository checks
pass. Passing Gate 2 permits Gate 3 implementation; it is not itself permission
to send production WhatsApp notifications or deploy.
