# Jev runtime integration — 16 October 2026

## Status

Implemented in the local application and enabled in ignored local configuration.
Not deployed. Production remains the previously verified agent release.
The owner approved normal-chat integration after the fictional comparison.
No additional paid model calls, database writes, outbound messages or hosted
configuration changes occurred during this implementation.

## Actual role

Jev classifies the current message as interested, declining or unclear about
exploring social activities. Its validated decision selects a bounded reply.
This uses the existing AAC slot, not another autonomous agent. Triage continues
care/safety extraction; deterministic policy owns risk, alerts and briefing.
Jev cannot modify risk, write memory, contact people or book activities.

The normal-chat branch is eligible for activity cues, a validated social signal
or a legacy AAC route. Urgent health, scam, capability limits, red risk and current
health/daily-living signals suppress this branch. Existing ordinary chat behavior
is preserved when the feature is off.

- Interested: ask one question about activity format; no invented event or booking.
- Declining: acknowledge the refusal; no invitation.
- Unclear: clarify willingness; no invitation.
- Failure/missing key/invalid output/overlong input: no activity suggestion.

The enabled standalone AAC tool uses the same helper, including care/scam and
capability guards. Disabled mode preserves its earlier LLM implementation.

## Implementation

- `src/lib/agents/socialIntentContract.ts`: shared evaluated label criteria,
  request builder and validated Jev response; no fictional dataset import.
- `src/lib/agents/socialDecision.ts`: native server-side fetch to the exact
  OpenRouter System One endpoint, pinned `typesafe/jev-1.14`, 1,000-character input
  bound, three-second abort, redirects rejected and no retries.
- `src/lib/agents/orchestrator.ts`: eligible reply selection and existing AAC trace.
- `src/app/api/agents/aac-nudge/route.ts`: honest configuration metadata;
  authorization/rate limits remain in place.
- `.env.example`: server-only `OPENROUTER_API_KEY` and explicit feature opt-in
  `TRUSTKAKI_JEV_ENABLED=true`. The committed default is false.

The local key was already saved by the owner. Only the non-secret enabled flag
was added locally; no credentials are in Git or this evidence. Provider failures
produce fixed safe error codes. Traces summarize input size rather than copy
raw messages and identify actual resolved model, decision, latency and fallback.
A failed or skipped decision has model `none`; it never claims a successful Jev call.
The existing demo-admin Run details panel displays these fields; ordinary
caregivers retain their existing restriction against technical traces.

## Verification

Final full regression run, with local-port permission for existing smoke tests:

```text
npm run test
Test Files  148 passed | 5 skipped (153)
Tests       1106 passed | 38 skipped (1144)
```

Earlier sandbox-only run: 1,095 passed / 38 skipped, with 10 existing smoke tests
blocked by `listen EPERM: operation not permitted 127.0.0.1`. The isolated smoke
file then passed all 16 tests with local-port permission. The final full run
above passes, including the reviewed correction.

```text
npm run typecheck
tsc --noEmit: exit 0
npm run lint
exit 0
npm run build
Compiled successfully
Finished TypeScript
Generating static pages (24/24)
exit 0
```

Built app started locally on temporary port 3127 and stopped after these checks:

```text
PASS built app: Jev enabled, configured, model typesafe/jev-1.14
PASS built app: unauthenticated AAC POST rejected with 401
PASS built app: root page HTTP 200
```

These HTTP checks used no model or database calls. Provider/orchestration tests
use mocked fetch: they verify each label, refusal/failure replacing invitations,
one reply, actual model attribution, no retries, three-second cancellation,
input/config guards, all care/scam/capability priorities, Mandarin output and
standalone AAC consistency. Existing authentication and trace-view tests pass.
The extracted contract preserves the original fictional dataset hash:
`43792575d465ba1583d9ef5770237673774b5b8c6d1ff513652e5ffaedf1b7b1`.

Independent code review found one Important issue: the standalone AAC path
initially missed capability priority. Fixed it, added a no-fetch capability
regression assertion and obtained re-review: no remaining Critical or Important
findings. Final full tests/build cover the correction.

## Judge walkthrough after hosted release

Use the existing fictional demo senior and demo-admin Run details panel:

1. “Can you find an activity near me?” — Jev `interested`; bounded preference question.
2. “Please stop recommending activities.” — Jev `declining`; no repeated suggestion.
3. “Maybe activities another day, see how first.” — show the actual result and
   corresponding branch; model output is not guaranteed for an untested phrase.
4. Mandarin option: “不要再推荐活动了。” — refusal acknowledged in Mandarin.
5. Expand Run details, then Technical values: show `Jev Social Decision`, decision,
   actual resolved model and fallback status.
6. A health/scam/capability-priority example demonstrates that social suggestions
   are suppressed, not that Jev handles medical or scam decisions.

Pitch wording: “We use Jev for a bounded social-interest decision. Code maps
that decision to a respectful reply, while deterministic policy controls care
risk. The care team can inspect which model ran and whether fallback was used.”

## Remaining release gates

The [release runbook](../operations/HACKATHON_RELEASE_RUNBOOK.md) requires its
separate approvals for hosted inspection, configuration/deployment and promotion.
Verify hosted OpenRouter key/feature flag, deploy an exact reviewed candidate
without moving the domain, and complete the required candidate checks before
promotion. Additional live calls need a bounded authorized scope; the earlier
US$1 fictional benchmark is not open-ended permission for app traffic.

The earlier real Jev benchmark proves provider compatibility for 36 fictional
messages; it is not live end-to-end verification of this new application path.
No hosted or signed-in UI claim is made here. The 38 skipped tests include
optional live/database checks and were not executed against production.
