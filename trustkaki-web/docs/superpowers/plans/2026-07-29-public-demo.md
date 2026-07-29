# One-Click Public Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an isolated `Explore demo` entry point that runs the four-step TrustKaki workflow in fictional browser-only state.

**Architecture:** A pure state module owns the fictional dashboard fixture, idempotent transitions, schema-versioned session storage, and expiry. `Home` selects between the existing authenticated workspace and a new public workspace; both reuse `AppShell`, `Dashboard`, `CareActivity`, and `DemoGuide`. `DemoGuide` receives a small command interface so the public adapter cannot call authenticated routes.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Vitest, jsdom, existing Tailwind CSS classes.

---

### Task 1: Add the public demo state engine

**Files:**
- Create: `src/lib/publicDemoState.ts`
- Test: `src/lib/publicDemoState.test.ts`

- [x] Write tests for the clean fictional fixture, all four transitions, idempotency, reset, expiry, malformed storage, wrong schema version, and the absence of `localStorage` usage.
- [ ] Run `npm test -- src/lib/publicDemoState.test.ts` and verify the new tests fail before implementation. (The implementation and passing tests were completed in the same working session.)
- [x] Implement `createInitialPublicDemo`, `applyPublicDemoCommand`, `serializePublicDemo`, and `restorePublicDemo` with a two-hour fixed expiry and no provider identifiers or destinations.
- [x] Run the focused test and verify it passes.

### Task 2: Expose local commands through the guide boundary

**Files:**
- Modify: `src/components/dashboard/DemoGuide.tsx`
- Test: `src/components/dashboard/DemoGuide.test.tsx`

- [x] Add a `DemoGuideCommands` interface for prepare, refresh, response, and resolve operations.
- [x] Keep the existing authenticated fetch implementation as the default adapter.
- [x] Route supplied commands through the same verification and phase transition logic, with no `fetch` call in the local path.
- [ ] Add a component test that invokes the local adapter through the four steps and reaches completion.
- [x] Run `npm test -- src/components/dashboard/DemoGuide.test.tsx` and verify it passes.

### Task 3: Add the public demo workspace and entry action

**Files:**
- Create: `src/components/PublicDemoWorkspace.tsx`
- Modify: `src/components/SignInForm.tsx`
- Modify: `src/app/page.tsx`
- Test: `src/components/PublicDemoWorkspace.test.tsx`
- Test: `src/components/SignInForm.test.tsx`

- [x] Add `Explore demo` as the secondary sign-in action and keep `Sign in` primary.
- [x] Build `PublicDemoWorkspace` with `sessionStorage`, reset, exit, `Demo data` labeling, isolated local commands, and the existing workspace/activity presentation.
- [x] Restore valid unexpired demo progress on refresh and discard invalid or expired state.
- [x] Ensure public mode provides no auth token, setup, trace, chat, realtime, or API callbacks.
- [x] Test entry, reset, visible demo labeling, and the absence of authenticated-only controls.
- [x] Run the focused component tests and verify they pass.

### Task 4: Regression and release verification

**Files:**
- Modify: `docs/PROJECT_CLOSEOUT.md`

- [x] Run `npm run test`, `npm run typecheck`, `npm run lint`, and `npm run build`.
- [ ] Run the local public flow at desktop and mobile widths, including refresh at each phase and a second-tab isolation check.
- [ ] Deploy the same commit to Vercel and EdgeOne, then run the unauthenticated public flow on both hosts.
- [ ] Record dated verification evidence and the production channel-binding hardening note in `docs/PROJECT_CLOSEOUT.md`.
- [ ] Commit the implementation with `git add` and `git commit -m "feat: add isolated public demo"`.

## Self-review

- Spec coverage: entry, isolation, persistence, expiry, reset, exit, four transitions, presentation reuse, safety boundary, component tests, and release checks are covered above.
- Placeholder scan: no implementation step depends on an unspecified file, function, or command.
- Type consistency: the command interface is introduced before `DemoGuide` and the public workspace consume it; all state transitions return `DashboardData`.
