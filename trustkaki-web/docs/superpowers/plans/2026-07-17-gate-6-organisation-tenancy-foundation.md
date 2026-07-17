# Gate 6 Organisation Tenancy Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a minimal, tenant-isolated organisation and staff-role foundation while preserving explicit family and volunteer access.

**Architecture:** Add organisations, active role memberships, and one owning organisation per senior. Keep `senior_caregivers` as the direct family/volunteer assignment model, centralize effective access and organisation administration in private PostgreSQL helpers, and make server sessions derive access from authenticated RLS reads. Keep `demo_admin` only for demo reset and simulator routes.

**Tech Stack:** PostgreSQL/Supabase migrations and RLS, Supabase Auth, Next.js App Router, TypeScript, Zod, Vitest, guarded live Supabase integration tests.

---

## File Map

- Create `supabase/migrations/20260717173000_gate_6_organisation_tenancy_foundation.sql`: schema, deterministic backfill, indexes, RLS helpers/policies, and replacement production-admin checks.
- Create `src/lib/security/gate6TenancyMigration.test.ts`: static migration contract and trusted-metadata checks.
- Modify `src/lib/supabase/types.ts`: organisation tables, membership role type, and required senior ownership.
- Modify `src/lib/auth/session.ts`: RLS-derived access, typed memberships, organisation-admin checks, and unchanged demo authority.
- Modify `src/lib/auth/session.test.ts`: typed parsing, fail-closed reads, access union, and admin/demo separation.
- Modify the eight `src/app/api/admin/**/route.ts` files: production organisation-admin authorization.
- Modify the three existing `src/app/api/admin/**/*.test.ts` files and create `src/lib/security/gate6AdminRouteBoundary.test.ts`: route behavior and complete source-boundary coverage.
- Modify `src/lib/persistence/contactPlanRepository.ts`: map database authorization denial without leaking details.
- Modify `src/lib/security/supabaseTestFixture.ts`, `gate2Contacts.integration.test.ts`, `gate4ProactiveCheckIns.integration.test.ts`, and `gate5Memory.integration.test.ts`: required organisation ownership and role compatibility.
- Modify `supabase/seed.sql`, `src/lib/persistence/demoRepository.ts`, and `demoRepository.test.ts`: preserve reset and Quick Demo writes under required senior ownership.
- Create `src/lib/security/liveProjectGuard.ts` and `liveProjectGuard.test.ts`: shared linked-project and hostname guard without secret output.
- Modify `src/lib/security/gate5Memory.integration.test.ts`: consume the shared project guard.
- Create `src/lib/security/gate6Tenancy.integration.test.ts`: meaningful two-organisation RLS, revocation, admin mutation, and cleanup proof.
- Create `docs/superpowers/verification/2026-07-17-gate-6-organisation-tenancy-foundation.md`: final evidence and limitations.

## Task 1: Tenancy Schema, Backfill, and RLS

**Files:**
- Create: `src/lib/security/gate6TenancyMigration.test.ts`
- Create: `supabase/migrations/20260717173000_gate_6_organisation_tenancy_foundation.sql`
- Modify: `src/lib/supabase/types.ts`
- Modify: `src/lib/security/supabaseTestFixture.ts`
- Modify: `src/lib/security/gate2Contacts.integration.test.ts`
- Modify: `src/lib/security/gate4ProactiveCheckIns.integration.test.ts`
- Modify: `src/lib/security/gate5Memory.integration.test.ts`
- Modify: `supabase/seed.sql`
- Modify: `src/lib/persistence/demoRepository.ts`
- Modify: `src/lib/persistence/demoRepository.test.ts`

- [ ] **Step 1: Write the failing migration contract test**

Create a test that reads the exact migration and checks security properties rather than only table names:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260717173000_gate_6_organisation_tenancy_foundation.sql"
  ),
  "utf8"
);

describe("Gate 6 organisation tenancy migration", () => {
  it("creates constrained tenancy ownership without browser writes", () => {
    expect(migration).toContain("create table public.organisations");
    expect(migration).toContain("create table public.organisation_memberships");
    expect(migration).toContain("unique (organisation_id, caregiver_id)");
    expect(migration).toContain("alter column organisation_id set not null");
    expect(migration).toContain("alter table public.organisations enable row level security");
    expect(migration).toContain("alter table public.organisation_memberships enable row level security");
    expect(migration).toContain("revoke all on public.organisation_memberships from public, anon, authenticated");
    expect(migration).toContain("grant select on public.organisation_memberships to authenticated");
  });

  it("uses trusted metadata only for the one-time demo-admin backfill", () => {
    expect(migration).toContain("auth.users");
    expect(migration).toContain("raw_app_meta_data");
    expect(migration).not.toContain("raw_user_meta_data");
  });

  it("requires active same-organisation membership and explicit volunteer assignment", () => {
    expect(migration).toContain("trustkaki_private.can_access_senior");
    expect(migration).toContain("organisation.active");
    expect(migration).toContain("membership.active");
    expect(migration).toContain("membership.role in ('org_admin', 'staff')");
    expect(migration).toContain("membership.role = 'volunteer'");
    expect(migration).toContain("assignment.role = 'aac_volunteer'");
    expect(migration).toContain("family_link.role = 'caregiver'");
  });

  it("replaces demo claims in every production database admin boundary", () => {
    expect(migration).toContain("trustkaki_private.is_org_admin_for_senior");
    expect(migration).toContain("trustkaki_private.require_contact_admin");
    expect(migration).toContain("trustkaki_private.require_context_admin");
    expect(migration).toContain("create or replace function public.manage_proactive_check_in_schedule");
  });
});
```

- [ ] **Step 2: Run the migration test and confirm it fails because the migration is absent**

Run:

```bash
npm test -- src/lib/security/gate6TenancyMigration.test.ts
```

Expected: FAIL with `ENOENT` for the new migration.

- [ ] **Step 3: Add the additive schema and deterministic backfill**

Create the migration with these concrete objects and constraints:

```sql
create table public.organisations (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug = lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null check (length(trim(display_name)) between 1 and 120),
  organisation_type text not null check (organisation_type in ('aac_centre')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null references public.organisations(id) on delete restrict,
  caregiver_id uuid not null references public.caregivers(id) on delete cascade,
  role text not null check (role in ('org_admin', 'staff', 'volunteer')),
  active boolean not null default true,
  deactivated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organisation_id, caregiver_id),
  check ((active and deactivated_at is null) or (not active and deactivated_at is not null))
);

insert into public.organisations (
  id, slug, display_name, organisation_type
) values (
  '00000000-0000-4000-8000-000000000006',
  'trustkaki-demo-aac',
  'TrustKaki Demo AAC',
  'aac_centre'
)
on conflict (id) do update set
  slug = excluded.slug,
  display_name = excluded.display_name,
  organisation_type = excluded.organisation_type;

alter table public.seniors add column organisation_id uuid;
update public.seniors
set organisation_id = '00000000-0000-4000-8000-000000000006'
where organisation_id is null;
alter table public.seniors
  alter column organisation_id set not null,
  add constraint seniors_organisation_id_fkey
    foreign key (organisation_id) references public.organisations(id) on delete restrict;
```

Backfill `org_admin` only by joining `caregivers.auth_user_id` to
`auth.users.id` and checking `raw_app_meta_data ->> 'role' = 'demo_admin'`.
Backfill `volunteer` only from distinct existing `senior_caregivers` rows with
`role = 'aac_volunteer'`. Use `on conflict (organisation_id, caregiver_id) do
nothing` for both inserts.

Add indexes for `seniors(organisation_id)`, active memberships by caregiver,
and active memberships by organisation/role. Reuse `public.set_updated_at()` for
both new tables.

- [ ] **Step 4: Replace the central senior-access helper**

Redefine `trustkaki_private.can_access_senior(target_senior_id uuid)` as a
stable `SECURITY DEFINER` SQL function with `set search_path = ''`. It must
return true for exactly these branches:

```sql
select exists (
  select 1
  from public.seniors senior
  where senior.id = target_senior_id
    and (
      exists (
        select 1
        from public.senior_caregivers family_link
        join public.caregivers caregiver on caregiver.id = family_link.caregiver_id
        where family_link.senior_id = senior.id
          and family_link.role = 'caregiver'
          and caregiver.auth_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.organisations organisation
        join public.organisation_memberships membership
          on membership.organisation_id = organisation.id
        join public.caregivers caregiver on caregiver.id = membership.caregiver_id
        where organisation.id = senior.organisation_id
          and organisation.active
          and membership.active
          and membership.role in ('org_admin', 'staff')
          and caregiver.auth_user_id = (select auth.uid())
      )
      or exists (
        select 1
        from public.organisations organisation
        join public.organisation_memberships membership
          on membership.organisation_id = organisation.id
        join public.caregivers caregiver on caregiver.id = membership.caregiver_id
        join public.senior_caregivers assignment
          on assignment.caregiver_id = caregiver.id
         and assignment.senior_id = senior.id
         and assignment.role = 'aac_volunteer'
        where organisation.id = senior.organisation_id
          and organisation.active
          and membership.active
          and membership.role = 'volunteer'
          and caregiver.auth_user_id = (select auth.uid())
      )
    )
)
```

Keep the existing execute revokes/grants. Existing dependent RLS policies then
inherit tenant behavior without being rewritten.

- [ ] **Step 5: Add organisation RLS and production-admin authorization**

Add a private `is_org_admin_for_senior(uuid)` helper that requires the current
Auth user, active organisation, active membership, and role `org_admin` for the
senior's owning organisation. Revoke it from `public` and `anon`; grant only to
`authenticated`.

Avoid policy recursion by adding private, stable, `SECURITY DEFINER` helpers
`is_active_org_member(uuid)` and
`can_view_org_membership(uuid, uuid)`. Both use an empty search path,
fully-qualified tables, trusted `auth.uid()`, and active-organisation checks.
Revoke from `public` and `anon`, then grant execute to `authenticated`.

Add select-only RLS through those helpers:

```sql
create policy "active members read own organisations"
  on public.organisations for select to authenticated
  using ((select trustkaki_private.is_active_org_member(id)));

create policy "members read own membership and admins read organisation roster"
  on public.organisation_memberships for select to authenticated
  using ((select trustkaki_private.can_view_org_membership(
    organisation_id, caregiver_id
  )));
```

Drop and recreate the five contact-table select policies using
`is_org_admin_for_senior` rather than `demo_admin`. Redefine
`require_contact_admin` and `require_context_admin` to call the same helper.
Replace the opening authorization block of
`manage_proactive_check_in_schedule` with:

```sql
v_actor := trustkaki_private.current_caregiver_id();
if v_actor is null
   or not trustkaki_private.is_org_admin_for_senior(p_senior_id) then
  raise exception 'Forbidden' using errcode = '42501';
end if;
```

Preserve every existing command binding, stale-conflict, transaction, event,
and return-value branch when redefining these functions.

- [ ] **Step 6: Update the TypeScript database contract**

Add:

```ts
export type OrganisationType = "aac_centre";
export type OrganisationMembershipRole = "org_admin" | "staff" | "volunteer";
```

Add complete `organisations` and `organisation_memberships` Row/Insert/Update
entries. Add required `organisation_id: string` to `seniors.Row` and
`organisation_id: string` to `seniors.Insert`.

- [ ] **Step 7: Update every existing synthetic senior fixture**

In `supabaseTestFixture.ts`, create one synthetic organisation, expose its ID on
`SupabaseRlsFixture`, set both seniors' `organisation_id`, and verify the
organisation is deleted after senior cleanup.

In `gate2Contacts.integration.test.ts`, give each synthetic admin an active
`org_admin` membership in `fixture.organisationId`; caregiver cascade removes
the membership during cleanup. Reorder `afterAll` so both temporary admins are
cleaned before `fixture.cleanup()` deletes the organisation.

In `gate4ProactiveCheckIns.integration.test.ts`, create two organisations,
assign one senior to each, and give each existing administrator matching active
`org_admin` membership. Delete organisations after seniors and caregivers.

In `gate5Memory.integration.test.ts`, create organisation A for the shared
senior and organisation B for the unrelated senior. Give only the caregiver
that performs correction/archive an `org_admin` membership in A. Set both
seniors' required ownership and include both organisations in verified cleanup.

Add the stable demo organisation ID to the senior insert/upsert column lists in
`supabase/seed.sql` and `demoRepository.ts`. Extend `demoRepository.test.ts` to
assert that Quick Demo passes
`organisation_id: "00000000-0000-4000-8000-000000000006"`; this prevents reset
or demo execution from relying on an unsafe database default.

- [ ] **Step 8: Run focused tests, typecheck, and disabled live-suite compilation**

Run:

```bash
npm test -- src/lib/security/gate6TenancyMigration.test.ts src/lib/security/authSecurityMigration.test.ts
npm run typecheck
npm test -- src/lib/security/rls.integration.test.ts src/lib/security/gate2Contacts.integration.test.ts src/lib/security/gate4ProactiveCheckIns.integration.test.ts src/lib/security/gate5Memory.integration.test.ts
npm test -- src/lib/persistence/demoRepository.test.ts
```

Expected: focused tests PASS, typecheck PASS, and live suites compile but remain
skipped. No runtime source file may use an unsafe cast to bypass the new types.

- [ ] **Step 9: Commit Task 1**

```bash
git add supabase/migrations/20260717173000_gate_6_organisation_tenancy_foundation.sql supabase/seed.sql src/lib/security/gate6TenancyMigration.test.ts src/lib/supabase/types.ts src/lib/security/supabaseTestFixture.ts src/lib/security/gate2Contacts.integration.test.ts src/lib/security/gate4ProactiveCheckIns.integration.test.ts src/lib/security/gate5Memory.integration.test.ts src/lib/persistence/demoRepository.ts src/lib/persistence/demoRepository.test.ts
git commit -m "feat: add gate 6 tenancy schema and rls"
```

## Task 2: Typed Session and Role Separation

**Files:**
- Modify: `src/lib/auth/session.test.ts`
- Modify: `src/lib/auth/session.ts`

- [ ] **Step 1: Write failing session tests**

Replace the direct `senior_caregivers` mock with a user-client mock that returns
RLS-filtered seniors and own memberships. Add assertions for this shape:

```ts
expect(result.auth).toMatchObject({
  role: "demo_admin",
  organisationMemberships: [
    { organisationId: "00000000-0000-4000-8000-000000000010", role: "org_admin" },
  ],
  accessibleSeniorIds: [
    "00000000-0000-4000-8000-000000000011",
    "00000000-0000-4000-8000-000000000012",
  ],
  administrableSeniorIds: ["00000000-0000-4000-8000-000000000011"],
});
```

Add separate tests proving:

```ts
expect(canAdministerSenior(auth, "00000000-0000-4000-8000-000000000011")).toBe(true);
expect(canAdministerSenior(auth, "00000000-0000-4000-8000-000000000012")).toBe(false);
expect(await requireOrganisationAdmin(request("token"))).toMatchObject({ ok: true });
expect(await requireDemoAdmin(request("org-admin-without-demo-claim")))
  .toMatchObject({ ok: false, status: 403 });
```

Add malformed-role and failed-RLS-read cases. Both must return `Forbidden` and
must not leak the database error text.

- [ ] **Step 2: Run the focused session tests and confirm failure**

```bash
npm test -- src/lib/auth/session.test.ts
```

Expected: FAIL because organisation membership and administration fields do not
exist.

- [ ] **Step 3: Implement RLS-derived typed session access**

Use `createTrustKakiUserClient(token)` after `serviceClient.auth.getUser(token)`.
Parse database results with Zod:

```ts
const membershipRowsSchema = z.array(z.object({
  organisation_id: z.string().uuid(),
  role: z.enum(["org_admin", "staff", "volunteer"]),
}));

const seniorRowsSchema = z.array(z.object({
  id: z.string().uuid(),
  organisation_id: z.string().uuid(),
}));
```

Extend `AuthenticatedCaregiver`:

```ts
organisationMemberships: Array<{
  organisationId: string;
  role: OrganisationMembershipRole;
}>;
accessibleSeniorIds: string[];
administrableSeniorIds: string[];
```

Query `organisation_memberships` for active rows belonging to the caregiver and
query `seniors` through the authenticated client. Compute administrable senior
IDs by matching senior organisation IDs to active `org_admin` memberships.
Return `Forbidden` on either Supabase error or Zod parse failure.

Add:

```ts
export function canAdministerSenior(
  auth: AuthenticatedCaregiver,
  seniorId: string
): boolean {
  return auth.administrableSeniorIds.includes(seniorId);
}

export async function requireOrganisationAdmin(request: Request): Promise<AuthResult> {
  const result = await requireAuthenticatedCaregiver(request);
  if (!result.ok) return result;
  if (!result.auth.organisationMemberships.some(({ role }) => role === "org_admin")) {
    return { ok: false, status: 403, error: "Forbidden" };
  }
  return result;
}
```

Keep `requireDemoAdmin` unchanged and based only on trusted Auth app metadata.

- [ ] **Step 4: Run the session and route regression tests**

```bash
npm test -- src/lib/auth/session.test.ts src/app/api/dashboard/state/route.test.ts src/app/api/demo/reset/route.test.ts
npm run typecheck
```

Expected: all tests PASS after updating shared auth fixtures with empty
`organisationMemberships` and `administrableSeniorIds` where required.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/lib/auth/session.ts src/lib/auth/session.test.ts
git commit -m "feat: derive organisation roles in authenticated sessions"
```

## Task 3: Production Admin Route Conversion

**Files:**
- Modify: all eight `src/app/api/admin/**/route.ts` files
- Modify: `src/lib/persistence/contactPlanRepository.ts`
- Modify: `src/lib/persistence/contactPlanRepository.test.ts`
- Modify: `src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.test.ts`
- Modify: `src/app/api/admin/seniors/[seniorId]/context/route.test.ts`
- Modify: `src/app/api/admin/contact-methods/[methodId]/consent/route.test.ts`
- Create: `src/lib/security/gate6AdminRouteBoundary.test.ts`

- [ ] **Step 1: Write failing route-boundary and behavior tests**

The source-boundary test must enumerate every production admin route and reject
demo authorization:

```ts
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routes = [
  "src/app/api/admin/contact-methods/[methodId]/consent/route.ts",
  "src/app/api/admin/contact-methods/[methodId]/route.ts",
  "src/app/api/admin/contacts/[contactId]/methods/route.ts",
  "src/app/api/admin/contacts/[contactId]/route.ts",
  "src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.ts",
  "src/app/api/admin/seniors/[seniorId]/contacts/route.ts",
  "src/app/api/admin/seniors/[seniorId]/context/route.ts",
  "src/app/api/admin/seniors/[seniorId]/recipient-preview/route.ts",
];

describe("Gate 6 production admin route boundary", () => {
  it.each(routes)("uses organisation administration in %s", (path) => {
    const source = readFileSync(resolve(process.cwd(), path), "utf8");
    expect(source).toContain("requireOrganisationAdmin");
    expect(source).not.toContain("requireDemoAdmin");
  });
});
```

Use the actual route count from `rg --files src/app/api/admin -g 'route.ts'`; if
it differs, update the explicit list before implementation so no route is
silently omitted.

Update the three route unit tests to mock `requireOrganisationAdmin`. Senior-ID
routes must also mock `canAdministerSenior` and prove a general staff access
result cannot mutate:

```ts
canAdministerSenior.mockReturnValueOnce(false);
const response = await POST(request, { params: Promise.resolve({ seniorId }) });
expect(response.status).toBe(403);
expect(mutateSeniorContext).not.toHaveBeenCalled();
```

Add `ContactPlanForbiddenError` tests proving an RPC error with code `42501` is
mapped to that bounded error while arbitrary database messages are not exposed.
The contact-ID route test must prove this error returns `{ error: "Forbidden" }`
with HTTP 403.

- [ ] **Step 2: Run the route tests and confirm failure**

```bash
npm test -- src/lib/security/gate6AdminRouteBoundary.test.ts src/app/api/admin
```

Expected: FAIL because routes still import `requireDemoAdmin`.

- [ ] **Step 3: Convert all production admin routes**

For routes with a `seniorId` parameter, use:

```ts
const authResult = await requireOrganisationAdmin(request);
if (!authResult.ok) return authJsonError(authResult);
const { seniorId } = await context.params;
if (!canAdministerSenior(authResult.auth, seniorId)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
```

For contact/contact-method ID routes, require an organisation admin at the HTTP
boundary and let the existing authenticated RPC map the object to its senior and
enforce exact-organisation authorization transactionally. Map RPC code `42501`
to `ContactPlanForbiddenError`, then map that class to HTTP 403 in all four
contact/contact-method ID routes. Never add a service-role lookup before the
RPC.

Leave these demo routes unchanged:

- `src/app/api/demo/reset/route.ts`
- `src/app/api/demo/pattern-watch/route.ts`
- `src/app/api/demo/pattern-watch/quick/route.ts`
- `src/app/api/telegram/dev/simulate/route.ts`
- `src/app/api/whatsapp/dev/simulate/route.ts`

- [ ] **Step 4: Run all admin, demo, and simulator route tests**

```bash
npm test -- src/app/api/admin src/app/api/demo src/app/api/telegram/dev src/app/api/whatsapp/dev src/lib/security/gate6AdminRouteBoundary.test.ts
```

Expected: PASS. Demo tests must still reject non-`demo_admin` users.

- [ ] **Step 5: Commit Task 3**

```bash
git add src/app/api/admin src/lib/security/gate6AdminRouteBoundary.test.ts src/lib/persistence/contactPlanRepository.ts src/lib/persistence/contactPlanRepository.test.ts
git commit -m "feat: authorize production admin routes by organisation"
```

## Task 4: Guarded Two-Organisation Integration Proof

**Files:**
- Create: `src/lib/security/liveProjectGuard.ts`
- Create: `src/lib/security/liveProjectGuard.test.ts`
- Modify: `src/lib/security/gate5Memory.integration.test.ts`
- Create: `src/lib/security/gate6Tenancy.integration.test.ts`

- [ ] **Step 1: Extract and test the shared live-project guard**

Move Gate 5's project-ref/hostname validation into:

```ts
export const TRUSTKAKI_PROJECT_REF = "mbzolhqtcbdfosifjkmd";

export function validateLiveProjectIdentity(args: {
  linkedProjectRef: string;
  configuredUrls: string[];
}): void {
  if (args.linkedProjectRef.trim() !== TRUSTKAKI_PROJECT_REF) {
    throw new Error("Live project guard rejected linked project ref");
  }
  if (args.configuredUrls.length === 0) {
    throw new Error("Live project guard requires a configured Supabase URL");
  }
  for (const configuredUrl of args.configuredUrls) {
    let hostname: string;
    try {
      hostname = new URL(configuredUrl).hostname.toLowerCase();
    } catch {
      throw new Error("Live project guard rejected configured Supabase URL");
    }
    if (hostname !== `${TRUSTKAKI_PROJECT_REF}.supabase.co`) {
      throw new Error("Live project guard rejected configured project host");
    }
  }
}
```

Add unit tests for the correct host, wrong linked ref, wrong host, deceptive
suffix host, invalid URL, and empty URL list. Keep file reads and environment
access in an `assertTrustKakiLiveProjectIdentity(supabaseRoot)` wrapper. Update
Gate 5 to import the shared helper without weakening its pre-setup and pre-cleanup
checks.

- [ ] **Step 2: Run the guard tests**

```bash
npm test -- src/lib/security/liveProjectGuard.test.ts src/lib/security/gate5Memory.integration.test.ts
```

Expected: guard tests PASS; Gate 5 live tests remain skipped.

- [ ] **Step 3: Create the disabled-by-default Gate 6 live suite**

Gate the suite on `TRUSTKAKI_RUN_LIVE_SUPABASE === "1"`. Before fixture setup
and cleanup, call `assertTrustKakiLiveProjectIdentity`.

Create unique marked fixtures for:

- organisations A and B;
- seniors A1, A2, and B1;
- users/caregivers admin A, staff A, volunteer A, family A, admin B, and a
  `demo_admin` user with no membership;
- memberships admin A=`org_admin`, staff A=`staff`, volunteer A=`volunteer`,
  admin B=`org_admin`;
- an explicit volunteer assignment from volunteer A to senior A1;
- an explicit family link from family A to senior A2;
- one dependent check-in/message per organisation using benign synthetic text.

Never print credentials or fixture content. Error helpers may expose only an
operation label and bounded error code.

- [ ] **Step 4: Prove access, revocation, and tenant isolation**

Add meaningful assertions:

```ts
expect(await visibleSeniorIds(adminA.client)).toEqual(expect.arrayContaining([a1, a2]));
expect(await visibleSeniorIds(staffA.client)).toEqual(expect.arrayContaining([a1, a2]));
expect(await visibleSeniorIds(volunteerA.client)).toEqual([a1]);
expect(await visibleSeniorIds(familyA.client)).toEqual([a2]);
expect(await visibleSeniorIds(adminB.client)).toEqual([b1]);
expect(await visibleSeniorIds(demoOnly.client)).toEqual([]);
```

Then deactivate staff A and volunteer A through the service client by setting
`active = false` and `deactivated_at` to the same bounded test timestamp. Prove
their organisation-derived reads become empty. Add a direct family link for
staff A to B1 before deactivation and prove only B1 remains visible afterward.
Reactivate membership rows with `active = true` and `deactivated_at = null`
before later assertions.

Deactivate organisation A and prove admin A, staff A, and volunteer A lose
organisation-derived access; family A retains A2 through the independent family
link. Reactivate the organisation before mutation tests.

Query a dependent table such as `messages` to prove RLS isolation is inherited,
not limited to the `seniors` table.

- [ ] **Step 5: Prove production administration and no partial cross-tenant writes**

Use admin A's authenticated client to call `create_senior_contact` for A1 and
assert success. Call the same RPC for B1 with a fresh command ID and assert a
`42501` error. Through the service client, assert there is no B1 contact and no
B1 audit event for the rejected command.

Use staff A, volunteer A, family A, and demo-only clients against A1 with fresh
command IDs; all must fail and leave no contacts or audit events. This proves
that case visibility and demo metadata do not imply production administration.

- [ ] **Step 6: Make cleanup verified and failure-safe**

Cleanup in dependency order: contacts/audits through senior cascade, messages,
check-ins, senior links, seniors, memberships, caregivers, organisations, then
Auth users. Collect cleanup failures without secrets. Query all created UUIDs
and marker-based external refs afterward and require zero rows. Auth-user delete
must succeed for every created user.

If setup fails, run the same cleanup and throw an `AggregateError` if cleanup
also fails.

- [ ] **Step 7: Run non-live integration compilation**

```bash
npm test -- src/lib/security/gate6Tenancy.integration.test.ts src/lib/security/liveProjectGuard.test.ts
npm run typecheck
```

Expected: guard tests PASS, live suite SKIPPED, typecheck PASS.

- [ ] **Step 8: Commit Task 4**

```bash
git add src/lib/security/liveProjectGuard.ts src/lib/security/liveProjectGuard.test.ts src/lib/security/gate5Memory.integration.test.ts src/lib/security/gate6Tenancy.integration.test.ts
git commit -m "test: prove gate 6 tenant isolation and revocation"
```

## Task 5: Non-Live Verification and Review Checkpoint

**Files:**
- Modify only files identified by validation failures attributable to Gate 6

- [ ] **Step 1: Run focused security tests**

```bash
npm test -- src/lib/security/gate6TenancyMigration.test.ts src/lib/security/gate6AdminRouteBoundary.test.ts src/lib/security/liveProjectGuard.test.ts src/lib/auth/session.test.ts src/app/api/admin
```

Expected: all focused tests PASS.

- [ ] **Step 2: Run complete validation**

```bash
npm run validate
```

Expected: all tests PASS with live suites skipped; typecheck, lint, and production
build PASS.

- [ ] **Step 3: Inspect security-sensitive diff**

```bash
git diff 6c8dca7...HEAD -- supabase/migrations src/lib/auth src/app/api/admin src/lib/security src/lib/supabase/types.ts
git diff --check
rg -n "service_role|SUPABASE_SERVICE_ROLE_KEY|authorization:|phone|telegram|whatsapp|destination_normalized|payload" src/lib/security/gate6* src/lib/auth/session.ts
```

Expected: no credentials, raw destinations, provider payloads, broad grants,
user-metadata roles, or unrelated changes. Any matching identifiers are only
field names or explicit negative assertions.

- [ ] **Step 4: Request independent audit before live operations**

Audit schema/backfill determinism, RLS recursion, cross-tenant family links,
inactive organisation behavior, admin RPC replacement completeness, service
boundaries, route authority, fixture cleanup, and test validity. Fix concrete
findings with focused tests and a separate commit.

- [ ] **Step 5: Pause for explicit live-operation approval**

Do not push migrations or enable `TRUSTKAKI_RUN_LIVE_SUPABASE` without explicit
user approval. Report the exact migration and guarded test command proposed.

## Task 6: Approved Live Verification and Final Evidence

**Files:**
- Create: `docs/superpowers/verification/2026-07-17-gate-6-organisation-tenancy-foundation.md`

- [ ] **Step 1: Verify linked migration status before mutation**

After explicit approval only:

```bash
npx supabase migration list --linked
```

Expected: local history contains only the new unapplied Gate 6 migration beyond
aligned remote history.

- [ ] **Step 2: Apply the reviewed migration**

After checking the generated SQL diff and project guard:

```bash
npx supabase db push --linked
```

Expected: only `20260717173000_gate_6_organisation_tenancy_foundation.sql` is
applied.

- [ ] **Step 3: Run the guarded Gate 6 suite three times**

```bash
TRUSTKAKI_RUN_LIVE_SUPABASE=1 node --env-file=.env.local ./node_modules/.bin/vitest run src/lib/security/gate6Tenancy.integration.test.ts
```

Expected each run: project guard PASS; all Gate 6 tests PASS; cleanup reports
zero synthetic residue. Repeating catches order dependence and stale fixture
assumptions.

- [ ] **Step 4: Run existing guarded RLS, Gate 4, and Gate 5 regressions**

```bash
TRUSTKAKI_RUN_DB_INTEGRATION=1 node --env-file=.env.local ./node_modules/.bin/vitest run src/lib/security/rls.integration.test.ts
TRUSTKAKI_RUN_LIVE_SUPABASE=1 node --env-file=.env.local ./node_modules/.bin/vitest run src/lib/security/gate4ProactiveCheckIns.integration.test.ts src/lib/security/gate5Memory.integration.test.ts
```

Expected: all existing live isolation, lifecycle, stale-conflict, immutability,
and cleanup checks PASS under organisation ownership.

- [ ] **Step 5: Check database history, lint, and advisors**

```bash
npx supabase migration list --linked
npx supabase db lint --linked --level warning
```

Use the existing approved advisor inspection workflow. Expected: migration
history aligned, no new lint errors, and no new error-level security or
performance findings attributable to Gate 6.

- [ ] **Step 6: Run final complete validation**

```bash
npm run validate
```

Expected: all non-live tests, typecheck, lint, and production build PASS.

- [ ] **Step 7: Write bounded verification evidence**

Record commit range, commands, pass counts, migration status, advisor summary,
tenant/isolation scenarios, cleanup counts, and limitations. Do not record
emails, names, UUIDs, destinations, tokens, raw senior content, or provider
payloads.

- [ ] **Step 8: Commit verification evidence**

```bash
git add docs/superpowers/verification/2026-07-17-gate-6-organisation-tenancy-foundation.md
git commit -m "docs: verify gate 6 tenancy foundation"
```

## Final Review Checklist

- [ ] Every senior has exactly one organisation.
- [ ] Organisation-derived access requires both active organisation and active membership.
- [ ] Volunteers also require an explicit senior assignment.
- [ ] Family links remain independent and senior-specific.
- [ ] Production admin authority comes only from active `org_admin` membership.
- [ ] `demo_admin` remains limited to demo/reset/simulator routes.
- [ ] No browser role can write memberships directly.
- [ ] Existing RPC idempotency, stale-conflict, event, and transaction behavior is unchanged.
- [ ] Cross-tenant rejected mutations produce no partial rows.
- [ ] Service credentials and sensitive identifiers never enter responses or logs.
- [ ] Guarded fixtures clean all database and Auth residue.
- [ ] Full validation and approved live evidence pass before Gate 6 is called complete.
