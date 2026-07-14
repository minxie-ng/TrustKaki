# Gate 2 Contacts, Consent, and Escalation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add admin-managed verified contact plans, auditable consent, quiet-hour enforcement, and deterministic recipient selection without sending notifications.

**Architecture:** Store contact people, methods, immutable consent events, audit events, and recipient decisions in RLS-protected Supabase tables. Keep selection deterministic in a pure TypeScript module for unit-level rule coverage, mirror the same ordered rules in a narrow SQL function used by the atomic escalation command, and expose masked read models through authenticated server routes. Add one compact contact-plan panel to the existing selected-senior dashboard.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod 4, Supabase Postgres/Auth/RLS/Realtime, Vitest, Tailwind CSS.

**Status (14 July 2026):** Independent audit remediation is implemented. Contact
and method idempotency keys are actor/payload-bound, destinations are validated
per channel, recipient exclusions survive the API boundary, and Realtime tests
now require an authenticated row event with a separate polling-fallback proof.
The follow-up privacy audit is also remediated: command bindings now use a
database-held HMAC-SHA-256 key in the private schema, with no destination-derived
fingerprint in public audit data. Final repository validation is recorded in the
verification evidence; Gate 2 does not send notifications.

**Migration note:** The CLI-created foundation migration is
`20260714053148_gate_2_contacts_consent_escalation.sql`. Review found two
security/integrity corrections before final verification, recorded normally as
`20260714055223_gate_2_contact_security_corrections.sql`. Contact-table Realtime
publication is recorded in
`20260714060530_gate_2_contact_realtime_publication.sql`. Local and remote
migration history are aligned. Independent-audit fixes are additive in
`20260714064523_gate_2_audit_remediation.sql`. Its rejected public fingerprint
design is superseded by `20260714070638_gate_2_private_command_bindings.sql` and
the deferred cleanup constraint in
`20260714071108_gate_2_private_binding_cleanup.sql`.

---

## File Structure

Create:

- `src/lib/contacts/contracts.ts` — contact-plan and selection domain types.
- `src/lib/contacts/recipientSelection.ts` — pure deterministic selection and quiet-hours rules.
- `src/lib/contacts/recipientSelection.test.ts` — rule-level test matrix.
- `src/lib/persistence/contactPlanRepository.ts` — masked reads and focused admin RPC adapters.
- `src/lib/persistence/contactPlanRepository.test.ts` — repository mapping, masking, and conflict tests.
- `src/app/api/seniors/[seniorId]/contact-plan/route.ts` and `.test.ts` — authorized masked reads.
- `src/app/api/admin/seniors/[seniorId]/contacts/route.ts` and `.test.ts` — contact creation.
- `src/app/api/admin/contacts/[contactId]/route.ts` and `.test.ts` — contact updates.
- `src/app/api/admin/contacts/[contactId]/methods/route.ts` and `.test.ts` — method creation.
- `src/app/api/admin/contact-methods/[methodId]/route.ts` and `.test.ts` — method updates.
- `src/app/api/admin/contact-methods/[methodId]/consent/route.ts` and `.test.ts` — immutable consent events.
- `src/app/api/admin/seniors/[seniorId]/recipient-preview/route.ts` and `.test.ts` — non-delivery preview.
- `src/components/dashboard/ContactPlanPanel.tsx` and `.test.ts` — caregiver summary and admin flow.
- `src/lib/security/gate2ContactsMigration.test.ts` — static migration security/contract checks.
- `src/lib/security/gate2Contacts.integration.test.ts` — live admin, caregiver, isolation, concurrency, and selection proof.
- `docs/superpowers/verification/2026-07-14-gate-2-contacts-consent-escalation.md` — dated evidence.

Modify:

- `src/lib/api/schemas.ts` and `.test.ts` — strict contact/admin/preview request schemas.
- `src/lib/supabase/types.ts` — Gate 2 tables, enums, and RPC signatures.
- `src/lib/types.ts` — masked contact-plan dashboard read model.
- `src/lib/persistence/caregiverCaseRepository.ts` and `.test.ts` — category-aware escalation result.
- `src/app/api/caregiver/queue-action/route.ts` and `.test.ts` — pass notification category.
- `src/components/dashboard/CaseUpdateForm.tsx` and `.test.ts` — category input for escalation.
- `src/components/Dashboard.tsx` — mount the focused contact-plan panel.
- `src/app/page.tsx` — fetch selected senior contact plan with stale-request protection.
- `src/lib/supabase/dashboardRealtime.ts` — include contact-plan tables as refresh hints.
- `src/lib/security/supabaseTestFixture.ts` — optional admin identity and contact fixture cleanup.
- `supabase/seed.sql` — realistic consented demo contacts without real personal data.
- `docs/TrustKaki_BUILD_ROADMAP.md`, `docs/TrustKaki_CODEX_HANDOFF.md`, and the Gate 2 plan — truthful status and evidence.

Create migrations through the Supabase CLI and retain every applied correction
as immutable migration history. Never edit an already-applied remote migration
as the only fix.

---

### Task 1: Deterministic Contact Selection Domain

**Files:**
- Create: `src/lib/contacts/contracts.ts`
- Create: `src/lib/contacts/recipientSelection.ts`
- Create: `src/lib/contacts/recipientSelection.test.ts`

- [x] **Step 1: Write failing rule tests**

Cover stable priority order, unverified/inactive/revoked/expired/category mismatch,
normal quiet hours, overnight quiet hours, urgent consent-bound bypass, latest-event
semantics, destination mapping, requested-channel filtering, and no-eligible output.

```ts
it("allows urgent quiet-hours bypass only with explicit consent", () => {
  const denied = selectNotificationRecipient(
    selectionInput({ category: "urgent_safety", evaluationTime: "2026-07-14T15:00:00Z" }),
    [candidate({ quietHours: ["22:00", "07:00"], allowUrgentQuietHours: false })]
  );
  const allowed = selectNotificationRecipient(
    selectionInput({ category: "urgent_safety", evaluationTime: "2026-07-14T15:00:00Z" }),
    [candidate({ quietHours: ["22:00", "07:00"], allowUrgentQuietHours: true })]
  );
  expect(denied.result).toBe("no_eligible_contact");
  expect(denied.candidates[0].reasonCodes).toContain("quiet_hours");
  expect(allowed.result).toBe("candidate_selected");
});

it("does not revive an older grant after the latest grant expires", () => {
  const result = selectNotificationRecipient(
    selectionInput(),
    [candidate({ consentEvents: [olderGrant(), expiredNewerGrant()] })]
  );
  expect(result.result).toBe("no_eligible_contact");
  expect(result.candidates[0].reasonCodes).toContain("consent_expired");
});
```

- [x] **Step 2: Run the tests and verify RED**

Run: `npm test -- src/lib/contacts/recipientSelection.test.ts`

Expected: FAIL because the contact contracts and selector do not exist.

- [x] **Step 3: Implement the minimum typed selector**

Define explicit unions and return explainable reason codes.

```ts
export type NotificationCategory =
  | "wellbeing_follow_up"
  | "health_safety"
  | "digital_safety"
  | "urgent_safety";

export type RecipientReasonCode =
  | "inactive_contact"
  | "inactive_method"
  | "destination_mismatch"
  | "channel_mismatch"
  | "unverified_method"
  | "consent_missing"
  | "consent_revoked"
  | "consent_expired"
  | "category_not_permitted"
  | "quiet_hours";

export function selectNotificationRecipient(
  input: RecipientSelectionInput,
  candidates: RecipientCandidate[]
): RecipientSelectionResult {
  const evaluated = candidates.map((candidate) => evaluateCandidate(input, candidate));
  const eligible = evaluated
    .filter((candidate) => candidate.reasonCodes.length === 0)
    .sort(compareRecipientCandidates);
  return {
    result: eligible.length > 0 ? "candidate_selected" : "no_eligible_contact",
    selectedContactId: eligible[0]?.contactId ?? null,
    selectedMethodId: eligible[0]?.methodId ?? null,
    candidates: evaluated,
  };
}
```

Use `Intl.DateTimeFormat(..., { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })` to derive local minutes. Treat null quiet-hour fields as no quiet hours and correctly handle windows crossing midnight.

- [x] **Step 4: Run tests and verify GREEN**

Run: `npm test -- src/lib/contacts/recipientSelection.test.ts`

Expected: all selection tests pass.

- [x] **Step 5: Commit the domain increment**

```bash
git add src/lib/contacts
git commit -m "feat: add deterministic contact selection"
```

---

### Task 2: Gate 2 Schema, RLS, and Transactional Commands

**Files:**
- Create with Supabase CLI: `supabase/migrations/20260714053000_gate_2_contacts_consent_escalation.sql`
- Create: `src/lib/security/gate2ContactsMigration.test.ts`
- Modify: `src/lib/supabase/types.ts`

- [x] **Step 1: Write a failing migration contract test**

The test locates the one migration ending in `_gate_2_contacts_consent_escalation.sql` and asserts RLS, append-only consent/audit protections, indexes, admin identity checks, empty search paths, revoked public execution, deterministic ordering, latest-event selection, idempotency, conflict checks, and atomic recipient-decision insertion.

```ts
const migrationPath = gate2MigrationPath();
const migration = readFileSync(migrationPath, "utf8");

it("keeps consent and audit evidence append-only", () => {
  expect(migration).toContain("create table public.contact_consent_events");
  expect(migration).toContain("create table public.contact_plan_audit_events");
  expect(migration).toContain("revoke update, delete on public.contact_consent_events");
  expect(migration).toContain("revoke update, delete on public.contact_plan_audit_events");
});

it("selects from the latest consent event only", () => {
  expect(migration).toContain("order by consent.confirmed_at desc, consent.created_at desc, consent.id desc");
  expect(migration).toContain("limit 1");
});
```

- [x] **Step 2: Run the test and verify RED**

Run: `npm test -- src/lib/security/gate2ContactsMigration.test.ts`

Expected: FAIL because no Gate 2 migration exists.

- [x] **Step 3: Create the migration using the normal workflow**

Run: `npx supabase migration new gate_2_contacts_consent_escalation`

Rename the generated empty file to
`supabase/migrations/20260714053000_gate_2_contacts_consent_escalation.sql`,
then populate that exact file. This preserves CLI creation while keeping the
plan and migration contract test deterministic.

Populate the generated file with:

- constrained tables from the approved design;
- `updated_at` triggers for mutable contact and method rows;
- indexes on senior, contact, active priority, method, consent ordering, command UUID, and caregiver-action decision lookup;
- RLS enabled on every new public table;
- admin policies requiring trusted `app_metadata.role = 'demo_admin'` and `trustkaki_private.can_access_senior(senior_id)`;
- no raw-table select policy for ordinary caregivers;
- focused `create_senior_contact`, `update_senior_contact`, `create_contact_method`, `update_contact_method`, and `record_contact_consent` RPCs;
- `trustkaki_private.select_notification_recipient(...)` implementing the same ordered rules as Task 1;
- replacement `escalate_caregiver_queue_case(...)` accepting `p_notification_category`, inserting the action, queue transition, and recipient decision atomically;
- explicit `REVOKE`/`GRANT` statements and append-only table privileges.

Each admin RPC must begin with equivalent checks:

```sql
if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'demo_admin'
   or trustkaki_private.current_caregiver_id() is null then
  raise exception 'Forbidden' using errcode = '42501';
end if;

if not trustkaki_private.can_access_senior(v_senior_id) then
  raise exception 'Forbidden' using errcode = '42501';
end if;
```

The selection ordering must be:

```sql
order by contact.escalation_priority,
         method.method_priority,
         contact.id,
         method.id
```

- [x] **Step 4: Update hand-maintained database types**

Add all row/insert/update shapes and RPC arguments/results to `src/lib/supabase/types.ts`. Keep raw destination fields server-only by never adding them to `src/lib/types.ts` caregiver read models.

- [x] **Step 5: Run focused tests and local static checks**

Run:

```bash
npm test -- src/lib/security/gate2ContactsMigration.test.ts \
  src/lib/contacts/recipientSelection.test.ts
npm run typecheck
```

Expected: migration and selector tests pass; typecheck passes.

- [x] **Step 6: Commit schema increment**

```bash
git add supabase/migrations src/lib/security/gate2ContactsMigration.test.ts src/lib/supabase/types.ts
git commit -m "feat: add gate two contact schema"
```

---

### Task 3: Strict API Contracts and Persistence Adapters

**Files:**
- Modify: `src/lib/api/schemas.ts`
- Modify: `src/lib/api/schemas.test.ts`
- Create: `src/lib/persistence/contactPlanRepository.ts`
- Create: `src/lib/persistence/contactPlanRepository.test.ts`
- Modify: `src/lib/types.ts`

- [x] **Step 1: Write failing schema and repository tests**

Test strict rejection of unknown keys, invalid timezones/times, unmasked read data,
short consent notes where required, category/override mismatch, stale conflict
mapping, duplicate command mapping, and deterministic preview mapping.

```ts
expect(contactConsentRequestSchema.safeParse({
  commandId: randomUUID(),
  eventType: "granted",
  categories: ["urgent_safety"],
  allowUrgentQuietHours: true,
  confirmationMethod: "verbal",
  confirmedAt: "2026-07-14T10:00:00+08:00",
}).success).toBe(true);

expect(maskContactDestination("whatsapp", "+6581234567")).toBe("•••• 4567");
expect(JSON.stringify(contactPlan)).not.toContain("+6581234567");
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- src/lib/api/schemas.test.ts src/lib/persistence/contactPlanRepository.test.ts`

Expected: FAIL because Gate 2 schemas and repository do not exist.

- [x] **Step 3: Add strict Zod schemas**

Add schemas for contact create/update, method create/update, consent event, and
recipient preview. Use `.strict()`, UUID command IDs, expected ISO timestamps,
HH:mm quiet-hour strings, bounded notes/names, and enum-only categories.

```ts
export const recipientPreviewRequestSchema = z.object({
  category: notificationCategorySchema,
  destination: escalationDestinationSchema,
  evaluationTime: z.string().datetime({ offset: true }),
  requestedChannel: contactChannelSchema.optional(),
}).strict();
```

- [x] **Step 4: Implement focused repository methods**

Expose only:

```ts
export async function readMaskedContactPlan(args: {
  seniorId: string;
}): Promise<MaskedContactPlan>;

export async function createSeniorContact(args: AdminContactCommand): Promise<ContactCommandResult>;
export async function updateSeniorContact(args: AdminContactCommand): Promise<ContactCommandResult>;
export async function createContactMethod(args: AdminMethodCommand): Promise<ContactCommandResult>;
export async function updateContactMethod(args: AdminMethodCommand): Promise<ContactCommandResult>;
export async function recordContactConsent(args: AdminConsentCommand): Promise<ContactCommandResult>;
export async function previewRecipient(args: RecipientPreviewCommand): Promise<RecipientSelectionResult>;
```

All writes use the authenticated user client and validate RPC output with Zod.
Masked reads use the server client only after route authorization and map raw
destinations immediately through `maskContactDestination`.

- [x] **Step 5: Run focused tests and verify GREEN**

Run: `npm test -- src/lib/api/schemas.test.ts src/lib/persistence/contactPlanRepository.test.ts`

Expected: all schema/repository tests pass.

- [x] **Step 6: Commit contracts and persistence**

```bash
git add src/lib/api src/lib/contacts src/lib/persistence/contactPlanRepository* src/lib/types.ts
git commit -m "feat: add contact plan persistence contracts"
```

---

### Task 4: Authorized Contact Plan APIs

**Files:**
- Create the seven route and route-test pairs listed in File Structure.

- [x] **Step 1: Write failing route tests**

For every mutation route prove 401 without a token, 403 for a non-admin, 400 for
invalid input, 409 for stale version, bounded 500 for repository failure, and
success with the authenticated admin actor. For the read route prove linked
caregiver success, unrelated caregiver 403, and absence of raw destination.

```ts
it("does not let a linked non-admin change consent", async () => {
  requireDemoAdminMock.mockResolvedValue({ ok: false, status: 403, error: "Forbidden" });
  const response = await POST(request(validConsentBody()), routeContext(methodId));
  expect(response.status).toBe(403);
  expect(recordContactConsentMock).not.toHaveBeenCalled();
});
```

- [x] **Step 2: Run route tests and verify RED**

Run: `npm test -- src/app/api/admin src/app/api/seniors/[seniorId]/contact-plan/route.test.ts`

Expected: FAIL because routes do not exist.

- [x] **Step 3: Implement narrow routes using existing auth helpers**

Read route:

```ts
const authResult = await requireAuthenticatedCaregiver(request);
if (!authResult.ok) return authJsonError(authResult);
if (!canAccessSenior(authResult.auth, seniorId)) {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
return NextResponse.json({ contactPlan: await readMaskedContactPlan({ seniorId }) });
```

Admin routes use `requireDemoAdmin`, verify access to the senior resolved from
the target row, parse strict schemas, and map `ContactPlanConflictError` to 409.
Never return repository error text or raw provider responses.

- [x] **Step 4: Run route tests and verify GREEN**

Run all new route tests plus `src/app/api/deployment-hardening.test.ts`.

- [x] **Step 5: Commit API increment**

```bash
git add src/app/api/admin src/app/api/seniors
git commit -m "feat: add contact plan APIs"
```

---

### Task 5: Atomic Escalation Recipient Decisions

**Files:**
- Modify: `src/lib/api/schemas.ts`
- Modify: `src/lib/persistence/caregiverCaseRepository.ts`
- Modify: `src/lib/persistence/caregiverCaseRepository.test.ts`
- Modify: `src/app/api/caregiver/queue-action/route.ts`
- Modify: `src/app/api/caregiver/queue-action/route.test.ts`
- Modify: `src/components/dashboard/CaseUpdateForm.tsx`
- Modify: `src/components/dashboard/CaseUpdateForm.test.ts`

- [x] **Step 1: Write failing escalation tests**

Prove escalation requires a notification category, repository passes it to the
new RPC signature, emergency guidance produces no recipient candidate, family
escalation returns a decision without claiming delivery, retry returns the same
decision, and actor/assignee/recipient IDs remain separate.

```ts
expect(queueActionRequestSchema.safeParse({
  ...validEscalation,
  notificationCategory: "health_safety",
}).success).toBe(true);

expect(result.recipientDecision).toEqual({
  result: "candidate_selected",
  selectedContactId: "contact-1",
  selectedMethodId: "method-1",
  delivered: false,
});
```

- [x] **Step 2: Run focused tests and verify RED**

Run the four modified test files. Expected: FAIL because notification category
and recipient decision are not part of the current command.

- [x] **Step 3: Implement the minimum command changes**

Add `notificationCategory` only for `actionType === "escalate"`. Extend the RPC
adapter and validated result with a non-delivery decision. Add a compact category
select to the existing escalation fields, with `urgent_safety` automatically
selected for `emergency_guidance` but still producing no external recipient.

- [x] **Step 4: Run focused tests and verify GREEN**

Run the four modified test files and the Gate 1 transition tests. Expected: all
pass and existing pending/acknowledged/escalated behavior remains unchanged.

- [x] **Step 5: Commit escalation integration**

```bash
git add src/lib/api src/lib/persistence/caregiverCaseRepository* \
  src/app/api/caregiver src/components/dashboard/CaseUpdateForm*
git commit -m "feat: bind escalation to consented recipients"
```

---

### Task 6: Focused Contact Plan UI

**Files:**
- Create: `src/components/dashboard/ContactPlanPanel.tsx`
- Create: `src/components/dashboard/ContactPlanPanel.test.ts`
- Modify: `src/components/Dashboard.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/lib/supabase/dashboardRealtime.ts`

- [x] **Step 1: Write failing presentation/state tests**

Test caregiver read-only mode, admin edit controls, masked destinations, concise
default content, consent/quiet-hours labels, preview explanations, pending state,
duplicate prevention, 409 refresh guidance, retry, and selected-senior request
sequence protection.

```ts
expect(contactPlanPresentation(plan, { isAdmin: false })).toMatchObject({
  canEdit: false,
  primaryContact: "Rachel Tan · Daughter",
  destination: "•••• 4567",
});
expect(JSON.stringify(contactPlanPresentation(plan, { isAdmin: false })))
  .not.toContain("+6581234567");
```

- [x] **Step 2: Run tests and verify RED**

Run: `npm test -- src/components/dashboard/ContactPlanPanel.test.ts`

Expected: FAIL because the panel does not exist.

- [x] **Step 3: Implement the compact panel and page state**

Mount `ContactPlanPanel` after `SelectedSeniorSummary`. Default caregiver view
shows the first eligible contact, escalation order, masked method, consent scope,
and availability. Put full methods, consent history summary, preview, and admin
forms behind one `View contact plan` disclosure.

Use a contact-plan request sequence ref mirroring the existing dashboard request
protection so switching seniors cannot render stale contacts. Disable all admin
actions while pending and retain command UUID across retry.

- [x] **Step 4: Add Realtime refresh hints**

Subscribe to `senior_contacts`, `contact_methods`, and `contact_consent_events`.
Callbacks only refetch the authorized masked API; never trust Realtime payload
contents as the read model.

- [x] **Step 5: Run UI tests, typecheck, and lint**

```bash
npm test -- src/components/dashboard/ContactPlanPanel.test.ts \
  src/components/dashboard/CaseUpdateForm.test.ts
npm run typecheck
npm run lint
```

- [x] **Step 6: Commit UI increment**

```bash
git add src/components src/app/page.tsx src/lib/supabase/dashboardRealtime.ts
git commit -m "feat: add caregiver contact plan panel"
```

---

### Task 7: Seed Data and Live Multi-User Verification

**Files:**
- Modify: `supabase/seed.sql`
- Modify: `src/lib/security/supabaseTestFixture.ts`
- Create: `src/lib/security/gate2Contacts.integration.test.ts`

- [x] **Step 1: Write the skipped-by-default live suite**

Create one admin user, two linked caregivers, one unrelated caregiver/senior,
multiple contacts/methods, and consent events. Tests must prove:

- admin mutation and non-admin rejection;
- raw-table RLS isolation and masked caregiver API behavior;
- stale command rollback and idempotent retry;
- immutable actor-attributed consent/audit history;
- every selector exclusion and urgent override;
- stable priority ordering;
- atomic escalation action/queue/decision insertion;
- actor, assignee, and recipient separation;
- Realtime status diagnostics and independent bounded polling fallback;
- complete temporary fixture cleanup.

- [x] **Step 2: Run before migration and verify RED**

```bash
TRUSTKAKI_RUN_DB_INTEGRATION=1 node --env-file=.env.local \
  ./node_modules/vitest/vitest.mjs run src/lib/security/gate2Contacts.integration.test.ts
```

Expected: FAIL because remote Gate 2 tables/functions are absent.

- [x] **Step 3: Add safe demo seed contacts**

Seed fictional contacts for all three demo seniors, including one expired consent,
one quiet-hours method, and at least one eligible family/AAC path. Never put the
user's real phone number or credentials in committed SQL.

- [x] **Step 4: Apply through normal Supabase workflow**

```bash
npx supabase db push --linked --dry-run
npx supabase db push --linked --yes
npx supabase migration list --linked
```

Verify only the Gate 2 migration is pending before push and local/remote history
aligns afterward.

- [x] **Step 5: Run the live suite three consecutive times**

Run the command from Step 2 three times. All runs must pass, classify Realtime
status, prove polling independently, and leave zero temporary rows/users.

- [x] **Step 6: Run database advisors**

```bash
npx supabase db advisors --linked --type security --level error --fail-on error
npx supabase db advisors --linked --type performance --level error --fail-on error
```

Expected: no error-level findings.

- [x] **Step 7: Commit seed and live verification**

```bash
git add supabase/seed.sql src/lib/security
git commit -m "test: verify gate two contact controls"
```

---

### Task 8: Browser Proof, Full Validation, and Gate Evidence

**Files:**
- Create: `docs/superpowers/verification/2026-07-14-gate-2-contacts-consent-escalation.md`
- Modify: `docs/superpowers/plans/2026-07-14-gate-2-contacts-consent-escalation.md`
- Modify: `docs/TrustKaki_BUILD_ROADMAP.md`
- Modify: `docs/TrustKaki_CODEX_HANDOFF.md`

- [x] **Step 1: Run authenticated browser workflows**

Using temporary data and real Supabase Auth:

1. Admin creates a family contact and method.
2. Admin verifies the method and grants category-specific consent.
3. Admin configures quiet hours and previews normal versus urgent selection.
4. Linked caregiver sees only the masked read-only plan.
5. Non-admin mutation is rejected.
6. Unrelated caregiver cannot access the plan.
7. Caregiver escalates a case; actor and assignee remain unchanged while the
   recipient candidate is recorded separately and no delivery is claimed.
8. Revoke consent; the next preview reports no eligible contact.
9. Refresh both sessions and confirm state persists.

Delete all temporary users and rows after collecting non-secret evidence.

- [x] **Step 2: Run the full repository gate**

Run: `npm run validate`

Expected: all default tests pass, live-only suites skip with explicit reason,
typecheck passes, lint passes, and production build succeeds.

- [x] **Step 3: Inspect hygiene and secret boundaries**

```bash
git diff --check
git status --short
git diff --stat
```

Confirm `.env.local` remains ignored, no raw destination appears in snapshots or
API fixtures, no unrelated dirty file is staged, and the existing unrelated
`package-lock.json` modification remains untouched unless independently explained.

- [x] **Step 4: Write truthful verification evidence**

Record exact migration, commands, focused test counts, three live runs, advisor
results, browser scenarios, cleanup, validation output, known limitations, and
whether Gate 2 is ready for independent audit. Do not call Gate 2 complete before
reviewer acceptance.

- [x] **Step 5: Update plan and roadmap status**

Mark only completed checklist items. Set roadmap status to `implementation
verified; independent audit pending` if and only if every required check passes.

- [x] **Step 6: Commit the verified Gate 2 baseline**

```bash
git add docs src supabase
git commit -m "feat: complete gate two contact controls"
git status --short
```

Do not push, deploy, merge, configure Meta callbacks, or begin Gate 3 without
explicit approval.

---

## Plan Self-Review

- Every approved design requirement maps to a task above.
- Admin authority uses existing trusted app metadata and still requires senior access.
- Contact destinations remain server-side and masked for caregivers.
- Latest-event consent semantics cannot revive an older grant.
- Selection is deterministic in unit logic and enforced in the escalation transaction.
- Gate 1 risk, concurrency, idempotency, actor, and assignee behavior remains covered.
- External delivery, scheduling, memory, organisation tenancy, and broad UI redesign are excluded.
