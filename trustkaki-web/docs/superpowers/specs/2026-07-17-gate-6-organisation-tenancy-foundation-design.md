# Gate 6 Organisation Tenancy Foundation Design

**Date:** 2026-07-17  
**Status:** Approved for implementation planning

## Objective

Add the minimum organisation-tenancy foundation needed to show that TrustKaki
can safely support more than one AAC centre. Organisation access must be
revocable, tenant-isolated, and compatible with the existing family-caregiver
and volunteer assignment model.

This is deliberately narrower than the full Gate 6 roadmap. It establishes the
security model without building operational infrastructure that is not needed
for the hackathon demonstration.

## Scope

This foundation will:

- represent generic care organisations, initially of type `aac_centre`;
- give each senior exactly one owning organisation;
- represent active and inactive organisation memberships;
- support `org_admin`, `staff`, and `volunteer` membership roles;
- preserve direct family-caregiver access;
- require explicit senior assignment for volunteers;
- replace global demo administration as the authority for production senior
  administration;
- keep demo-only reset and simulation controls isolated behind `demo_admin`;
- prove tenant isolation and access revocation through focused tests.

The foundation will not add roster-management screens, invitations, bulk
imports, organisation onboarding, expanded Realtime features, distributed rate
limiting, worker observability, backup automation, load testing, data-export
workflows, or broad UI changes. Those require separate need and review.

Senior profile photos are deferred to Gate 7. That work should include circular
portraits, fallback initials, accessible alternative text, mobile verification,
and an explicit consent/privacy decision. Demo portraits should be generated or
otherwise licensed and must not depict real enrolled seniors without consent.

## Data Model

### Organisations

Add an `organisations` table with:

- UUID primary key;
- unique stable slug;
- display name;
- organisation type, initially restricted to `aac_centre`;
- active flag;
- creation and update timestamps.

The table is generic so later care-organisation types can be introduced through
an explicit migration rather than a schema replacement.

### Organisation memberships

Add an `organisation_memberships` table joining a caregiver identity to an
organisation. Each row contains:

- organisation ID;
- caregiver ID;
- role: `org_admin`, `staff`, or `volunteer`;
- active flag;
- creation and update timestamps;
- optional deactivation timestamp.

There is at most one membership per caregiver and organisation. Deactivation
keeps the row and its history while immediately removing organisation-derived
access. A person may belong to more than one organisation, and each membership
is evaluated independently.

Membership administration remains service-controlled in this foundation. A
browser-facing roster mutation API is deferred until roster management is
designed with immutable membership audit events.

### Senior ownership

Add a non-null `organisation_id` foreign key to `seniors`. Each senior belongs
to exactly one active or historical owning organisation at a time. Organisation
transfer is outside this foundation and must later be implemented as an audited
operation rather than a casual update.

The existing `senior_caregivers` table remains authoritative for:

- direct family-caregiver access through `role = 'caregiver'`;
- volunteer assignment through `role = 'aac_volunteer'`;
- senior-specific relationship and primary-contact information.

Organisation membership does not replace personal care relationships.

## Authorization Model

Database authorization remains authoritative. Effective senior access is the
union of these rules:

1. An explicitly linked family caregiver can access that senior.
2. An active `org_admin` or `staff` member of an active organisation can access
   seniors owned by that organisation.
3. An active `volunteer` member of an active organisation can access a senior
   in that organisation only when an explicit `aac_volunteer` assignment also
   exists.

Inactive organisations and inactive memberships grant no organisation access.
A user from another organisation receives no access. If an inactive staff
member also has a genuine family link, only the independently authorised family
access remains.

Private, `SECURITY DEFINER` authorization helpers will implement these rules
with an empty search path and fully qualified relations. Existing RLS policies
will continue to call the senior-access helper, so dependent tables inherit the
new tenant boundary without duplicating role logic.

Organisation and membership reads will also use RLS. Active members may read
their organisation and their own membership. Active organisation administrators
may read memberships in their organisation. No authenticated browser role gets
direct membership writes in this foundation.

## Server Authorization

The authenticated server session will return:

- caregiver identity;
- active organisation memberships;
- effective accessible senior IDs;
- the separate trusted `demo_admin` application-metadata flag.

Membership roles come from the database, not user-editable metadata. Query or
parsing failures fail closed.

Existing production senior-administration routes and their database RPC checks
will require active `org_admin` membership in the senior's organisation. This
includes contact administration, proactive check-in schedule administration,
and context correction/archive operations.

Demo reset and development simulation routes will continue to require the
trusted `demo_admin` claim. An `org_admin` membership alone cannot invoke those
routes, and a `demo_admin` claim alone cannot access organisation data.

Service-role messaging, orchestration, and scheduled work remain server-only.
They continue to operate on explicit senior IDs and do not expose service
credentials or broaden browser grants.

## Compatibility Migration

The migration will be additive and deterministic:

1. Create a stable legacy/demo AAC organisation.
2. Assign all existing seniors to that organisation before making ownership
   non-null.
3. Map the existing trusted demo administrator's caregiver identity to an
   active `org_admin` membership.
4. Map existing AAC volunteer identities to active `volunteer` memberships.
5. Leave ordinary family caregivers outside organisation membership.
6. Preserve all existing senior-caregiver links and historical records.

The administrator backfill must use trusted Auth application metadata or an
explicit stable seed identity, never user-editable metadata. The migration must
be rerunnable where practical and must not duplicate organisations or
memberships.

Existing family and volunteer behavior remains available after backfill. The
current demo administrator may hold both an organisation role and a genuine
family link; each authorization source remains independently revocable.

## Error Handling and Privacy

Unauthorized requests return only `Unauthorized` or `Forbidden`. Responses and
logs must not reveal whether a senior, organisation, or membership exists.
Database failures fail closed and are recorded only through existing bounded
server logging conventions.

Tests and implementation logs must not include raw phone numbers, Telegram or
WhatsApp identifiers, destinations, access tokens, service keys, provider
payloads, or unnecessary senior content.

No policy, messaging, memory, or persistence decision may depend on an
organisation display name or staff role beyond authorization. Deterministic
risk policy remains independent from tenancy.

## Testing Strategy

Focused unit and migration tests will verify schema constraints, TypeScript
types, session parsing, fail-closed behavior, route role checks, and continued
separation between `demo_admin` and organisation administration.

A guarded Supabase integration suite will create two organisations and prove:

- `org_admin` and `staff` can read seniors in their own organisation;
- volunteers can read only explicitly assigned seniors in their organisation;
- family caregivers retain only direct case access;
- inactive staff and volunteers immediately lose organisation-derived access;
- deactivating an organisation removes organisation-derived access for all of
  its members;
- a separate family link survives unrelated membership deactivation;
- unrelated organisations cannot read senior records or dependent case data;
- cross-organisation administrative mutation is rejected without partial
  writes;
- own-organisation administrative mutation succeeds for `org_admin` only;
- an organisation role cannot invoke demo-only controls;
- a demo claim without membership cannot access organisation data;
- existing persistence, deduplication, messaging, memory, and deterministic
  policy tests continue to pass.

Synthetic fixtures must use a unique marker, a linked-project guard, and cleanup
that checks all created rows and Auth users are removed. Live operations require
separate explicit approval; non-live validation remains the default.

## Delivery Boundaries

Implementation should be split into small, auditable tasks:

1. schema, migration, RLS helpers, and generated TypeScript types;
2. server session and route/RPC authorization compatibility;
3. focused non-live and guarded integration verification;
4. documentation and independent audit.

Gate 6 stops after the tenancy foundation is verified. Roster UI and scaling
infrastructure are not prerequisites for the hackathon demonstration and should
not delay Gate 7 usability work.

## Exit Criteria

The foundation is complete when two organisations are demonstrably isolated,
staff access follows active membership, volunteers remain assignment-scoped,
family access is preserved, demo authority is separated from production
authority, existing behavior passes regression validation, and all synthetic
fixtures are removed.
