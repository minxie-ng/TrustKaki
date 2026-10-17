# Jev specialist routing: locally implemented

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


16 October 2026. Owner approved the
[authority design](../superpowers/specs/2026-10-16-jev-specialist-routing-design.md).
Implementation follows the [plan](../superpowers/plans/2026-10-16-jev-specialist-routing.md).
**No paid model calls, live database access, hosted configuration changes,
deployment or promotion.** Active routing is disabled by default.

## What changed

- Existing routing transport supports active and shadow modes. Active takes
  precedence if both flags are true; they share one request started in parallel
  with Triage. Shadow-only retains its prior observational behavior.
- A pure combiner adds Jev-requested work to independent Triage/lexical triggers.
  Present/unclear digital safety invokes Digital Safety; present durable context
  invokes Context Memory only if existing exclusions allow it; present social
  makes the existing social-intent specialist eligible. Each specialist runs at
  most once per message.
- Jev absence cannot cancel an independent trigger. Unclear durable context
  does not add extraction. Missing/invalid/timeout/failed routing falls back to
  existing routing; three-second routing timeout and one attempt remain.
- Health, daily-living or urgent present/unclear pauses activity suggestions.
  If an otherwise eligible social discussion has this classifier discrepancy
  without Triage care evidence, select the approved short clarification. No care
  signal, severity, alert, risk change or persisted task is fabricated from it.
- Urgent, safety and capability replies retain priority. Jev-requested safety
  assessment without a positive scam determination gets a cautious server-owned
  verification response, not reassurance that the request is safe.
- Active traces show actual model/version, six labels, requested specialists,
  independent triggers, actual invoked specialists, exclusions/priority blocks,
  overrides and fallback. They contain bounded metadata, not raw context or
  provider exception prose. Shadow traces retain their prior format.

`TRUSTKAKI_JEV_ROUTING_ENABLED=false` is documented in `.env.example`. No local
or hosted secret/configuration was edited. Routing alone does not enable social
inference: that still needs `TRUSTKAKI_JEV_ENABLED=true`. Turning authority off
restores current routing for subsequent messages; the shadow flag is independent.

The existing full-chat shadow benchmark now explicitly pins authority off and
restores its previous value, preventing a local active setting from silently
changing that experiment. Its fingerprint includes the new routing helper.
Historical reports and frozen spending ledgers remain unchanged. This modified
runner was tested with mocked transport only; it was not executed live.

## Verification evidence

Feature tests were written before implementation. The new combiner suite first
failed because the module did not exist; active transport tests failed on the
missing mode; ten active orchestration cases failed because requested work was
not invoked or activity handling was not paused. After wiring, the shadow
benchmark environment-isolation test reproduced an unintended active request;
pinning authority off fixed it.

Final focused checks: **202 tests passed**, four suites. Net full-suite increase:
**31 cases**. Coverage includes actual orchestration with mocked provider
transport, Jev-only invocation, mixed/duplicate triggers, uncertainty, independent
overrides, recall/secret exclusions, social enablement, care clarification,
urgent precedence, absent keys, invalid responses, transport/HTTP failures,
both-mode single-request behavior, active/shadow timeout and private trace data.
Existing reply corrections, social refusal and shadow noninterference tests pass.

Final commands all exited 0:

```text
npm run test
Test Files 153 passed | 5 skipped (158)
Tests 1210 passed | 38 skipped (1248)

npm run typecheck
npm run lint
npm run build
Compiled successfully
Generating static pages (24/24)
```

Full tests used localhost access for local test servers. No external provider or
live database was used. Independent AI review found no Critical or Important
issues and independently ran the four focused suites: 202 passed.

## Limits and next checkpoint

These are functional tests with fictional fixtures and mocked model outputs.
They prove what the app does with supplied judgments, not how accurately Jev
judges unseen messages. Triage still runs and writes replies; active routing adds
a request and may add latency. No measured cost/latency improvement is claimed.
Jev care labels are not a replacement for care detection or medical judgment.

The existing live routing and full-chat results describe earlier source, not
this active authority implementation. Next prepare a separately scoped fictional
live evaluation with Jev-caused invocations, false-positive care flags, ambiguity,
provider fallback and corrected reply cases. New spending requires separate
approval. Hosted deployment, authenticated checks and promotion remain separate
release checkpoints. The public site has not changed.
