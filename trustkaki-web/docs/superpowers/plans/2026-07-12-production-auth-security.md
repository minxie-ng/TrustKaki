# Production Auth Security Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require authenticated, caregiver-scoped access for senior data and privileged demo operations while preserving the existing judge demo flow.

**Architecture:** Browser sign-in uses Supabase Auth email/password with no public sign-up. Client requests attach the Supabase access token; server route helpers verify the token with Supabase, map it to a caregiver row, check `senior_caregivers`, and gate demo routes using trusted `app_metadata.role === "demo_admin"`. Existing service-role repository functions remain server-only but receive authorized scope, and a new migration replaces anonymous demo RLS policies with relationship-scoped authenticated policies.

**Tech Stack:** Next.js App Router route handlers, React client components, Supabase Auth/SSR/client libraries, Zod, Vitest, TypeScript, ESLint.

---

### Task 1: Auth Helper And Protected Route Contract

**Files:**
- Create: `src/lib/auth/session.ts`
- Create: `src/lib/auth/session.test.ts`
- Modify: `src/lib/api/responses.ts`

- [ ] **Step 1: Write failing tests**

Create tests that prove:

```ts
expect(await requireAuthenticatedCaregiver(requestWithoutBearer)).toMatchObject({
  ok: false,
  status: 401,
});
expect(await requireDemoAdmin(requestWithNonAdmin)).toMatchObject({
  ok: false,
  status: 403,
});
expect(await requireAccessibleSenior(auth, DEMO_SENIOR_ID)).toMatchObject({
  ok: true,
});
```

- [ ] **Step 2: Run red test**

Run:

```bash
./node_modules/.bin/vitest run src/lib/auth/session.test.ts
```

Expected: fails because the auth helper does not exist.

- [ ] **Step 3: Implement auth helper**

Implement:

```ts
export interface AuthenticatedCaregiver {
  userId: string;
  email: string | null;
  role: string | null;
  caregiverId: string;
  caregiverName: string;
  accessibleSeniorIds: string[];
}

export async function requireAuthenticatedCaregiver(request: Request): Promise<AuthResult>;
export async function requireDemoAdmin(request: Request): Promise<AuthResult>;
export function authJsonError(result: AuthFailure): Response;
export function canAccessSenior(auth: AuthenticatedCaregiver, seniorId: string): boolean;
```

The helper reads `Authorization: Bearer <access-token>`, verifies with Supabase Auth, maps `auth.users.id` to `caregivers.auth_user_id`, and loads accessible senior IDs from `senior_caregivers`.

- [ ] **Step 4: Run green test**

Run:

```bash
./node_modules/.bin/vitest run src/lib/auth/session.test.ts
```

Expected: pass.

### Task 2: Input Validation And Rate Limiting

**Files:**
- Create: `src/lib/api/rateLimit.ts`
- Create: `src/lib/api/rateLimit.test.ts`
- Create: `src/lib/api/schemas.ts`
- Create: `src/lib/api/schemas.test.ts`
- Modify: `src/lib/agents/schemas.ts`

- [ ] **Step 1: Write failing tests**

Tests prove:

```ts
expect(agentRequestSchema.safeParse({ message: "x".repeat(5001) }).success).toBe(false);
expect(queueActionRequestSchema.safeParse({ queueItemId: "id", actionType: "resolve" }).success).toBe(true);
expect(checkRateLimit({ key: "u1", route: "demo", limit: 2, windowMs: 1000 }).allowed).toBe(true);
expect(thirdAttempt.allowed).toBe(false);
```

- [ ] **Step 2: Run red tests**

Run:

```bash
./node_modules/.bin/vitest run src/lib/api/rateLimit.test.ts src/lib/api/schemas.test.ts
```

Expected: fails because helpers do not exist.

- [ ] **Step 3: Implement helpers**

Implement bounded Zod schemas for agent, queue action, and JSON parsing. Implement an in-process limiter keyed by authenticated user and route with `429` metadata. Document it as single-instance only in README.

- [ ] **Step 4: Run green tests**

Run:

```bash
./node_modules/.bin/vitest run src/lib/api/rateLimit.test.ts src/lib/api/schemas.test.ts
```

Expected: pass.

### Task 3: Protect API Routes

**Files:**
- Modify: `src/app/api/dashboard/state/route.ts`
- Modify: `src/app/api/caregiver/queue-action/route.ts`
- Modify: `src/app/api/agents/*.ts`
- Modify: `src/app/api/demo/**/*.ts`
- Modify: `src/app/api/whatsapp/dev/simulate/route.ts`
- Modify tests next to those routes.

- [ ] **Step 1: Write failing tests**

Add route tests proving:

```ts
expect(unauthenticatedDashboard.status).toBe(401);
expect(nonAdminQuickDemo.status).toBe(403);
expect(malformedAgentRequest.status).toBe(400);
expect(rateLimitedAgentRequest.status).toBe(429);
```

- [ ] **Step 2: Run red tests**

Run route-specific Vitest files. Expected: fail because routes are currently open.

- [ ] **Step 3: Implement route guards**

Protected routes call `requireAuthenticatedCaregiver`. Demo routes call `requireDemoAdmin`. Public routes remain `/api/health` and `/api/whatsapp/webhook`; internal processor stays bearer-secret protected. Dev simulator requires development flag plus demo-admin auth.

- [ ] **Step 4: Run green tests**

Run changed route tests. Expected: pass.

### Task 4: Repository Scoping And Reset Failure Handling

**Files:**
- Modify: `src/lib/persistence/trustkakiRepository.ts`
- Modify: `src/lib/persistence/orchestration.test.ts`
- Add or modify focused repository tests.

- [ ] **Step 1: Write failing tests**

Tests prove cross-caregiver queue mutations fail and reset surfaces deletion failures:

```ts
await expect(recordCaregiverQueueAction({ auth, queueItemId: "other" })).rejects.toThrow("Forbidden");
await expect(resetDemoPersistence()).rejects.toThrow("reset demo");
```

- [ ] **Step 2: Run red tests**

Expected: fail because repository operations do not accept auth scope and reset ignores delete errors.

- [ ] **Step 3: Implement minimal repository changes**

Add optional `auth`/`seniorId` parameters. Check queue item senior ownership before mutation. Validate assignment caregiver shares the same senior. Replace reset `Promise.all` with checked mutation results and prefer RPC `trustkaki_private.reset_demo_data` when available.

- [ ] **Step 4: Run green tests**

Expected: pass.

### Task 5: Supabase Migration And Seed Documentation

**Files:**
- Create: `supabase/migrations/20260712010000_auth_security_foundation.sql`
- Modify: `supabase/seed.sql`
- Add migration static tests.

- [ ] **Step 1: Write failing tests**

Static tests assert:

```ts
expect(sql).not.toContain("to anon using (true)");
expect(sql).toContain("auth_user_id uuid unique references auth.users");
expect(sql).toContain("auth.jwt() -> 'app_metadata'");
expect(sql).toContain("revoke all on function trustkaki_private.reset_demo_data");
```

- [ ] **Step 2: Run red tests**

Expected: fail because migration does not exist.

- [ ] **Step 3: Add migration**

Migration adds `caregivers.auth_user_id`, indexes, relationship helper functions, scoped authenticated policies, inaccessible WhatsApp browser policies, and a transactional reset RPC in `trustkaki_private` with explicit `search_path`.

- [ ] **Step 4: Run green tests**

Expected: pass.

### Task 6: UI Sign-In And Authenticated Fetch

**Files:**
- Create: `src/components/SignInForm.tsx`
- Modify: `src/app/page.tsx`
- Modify: `src/components/Dashboard.tsx`
- Add/update component view-model tests.

- [ ] **Step 1: Write failing tests**

Tests prove:

```ts
expect(authHeader(session)).toEqual({ Authorization: "Bearer token" });
expect(canShowDemoControls({ role: "demo_admin" })).toBe(true);
expect(canShowDemoControls({ role: "caregiver" })).toBe(false);
```

- [ ] **Step 2: Run red tests**

Expected: fail because helpers/UI state do not exist.

- [ ] **Step 3: Implement UI auth flow**

Root hydrates Supabase session, shows sign-in when unauthenticated, passes `authToken` to dashboard/chat requests, handles `401` by returning to sign-in, and shows demo controls only for demo admin. Add sign-out.

- [ ] **Step 4: Run green tests**

Expected: pass.

### Task 7: LLM Timeout

**Files:**
- Modify: `src/lib/agents/provider.ts`
- Modify: `src/lib/agents/provider.test.ts`
- Modify: `.env.example`
- Modify: `README.md`

- [ ] **Step 1: Write failing tests**

Test that `TRUSTKAKI_LLM_TIMEOUT_MS=50` aborts a hanging fetch and throws a timeout error without exposing token/provider response bodies.

- [ ] **Step 2: Run red test**

Expected: fail because provider does not set a timeout signal.

- [ ] **Step 3: Implement timeout**

Use `AbortSignal.timeout(boundedTimeoutMs)` and a default timeout. Clamp env to safe bounds.

- [ ] **Step 4: Run green test**

Expected: pass.

### Task 8: Final Verification And Commit

**Files:**
- All changed files.

- [ ] **Step 1: Run full verification**

```bash
./node_modules/.bin/vitest run
./node_modules/.bin/tsc --noEmit
npm run lint
npm run build
```

- [ ] **Step 2: Inspect worktree**

```bash
git status --short
git diff --stat
```

- [ ] **Step 3: Commit**

```bash
git add .
git commit -m "feat: add production auth security foundation"
```

---

## Spec Coverage Review

- Authentication experience: Tasks 1 and 6.
- Identity and authorization: Tasks 1, 3, 4, and 5.
- Database security/RLS: Task 5.
- Server request authentication: Tasks 1 and 3.
- Input and abuse protection: Tasks 2 and 7.
- Demo reset consistency: Tasks 4 and 5.
- UI behavior: Task 6.
- Tests: Tasks 1 through 8.
- Deployment docs: Tasks 5 and 7.
- Non-goals preserved: no public signup, no org admin UI, no distributed limiter, no WhatsApp model change, no orchestration replacement.
