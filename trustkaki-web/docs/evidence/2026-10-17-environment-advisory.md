# Outdoor conditions tool — local implementation

Status: released to https://trustkaki.vercel.app on 17 October 2026 with the owner's deployment and promotion approval.

- Runtime commit: `88572778d28e7eb2d899ab26c6845d4d58a63d7f`.
- Deployment: `dpl_z9yzarBvXz7jbRF8NZuycegCnfUk`, READY, production target.
- Candidate: https://trustkaki-lfzi7s4s6-minxie-ngs-projects.vercel.app.
- Required Vercel build: passed, `Build Completed in /vercel/output [41s]`.
- Promotion: CLI confirmed success for that deployment in 3 seconds.
- No additional tests, paid chats, fixtures or public smoke calls during release, as agreed. Hosted full-chat operation has not been demonstrated; promotion confirms deployment, not that additional behavioural check.

## Behaviour

- Existing activity specialist uses a deterministic server tool in ordinary orchestration. The lexical outdoor cue independently supplements Jev routing; the trace distinguishes the government tool from actual Jev inference.
- Four fixed public endpoints: api-open.data.gov.sg/v2/real-time/api/{two-hr-forecast,twenty-four-hr-forecast,psi,pm25}. All four public endpoints returned HTTP 200 during source inspection, with no user records or credentials sent.
- Current plans use a valid 2-hour area forecast. Tomorrow uses the national 24-hour outlook with explicit time bounds; common English clock times must fall inside those bounds. Unparsed future plans receive no claim of forecast coverage.
- Current regional PSI and 1-hour PM2.5 are labelled as observations, not predictions. PM2.5 advice follows NEA's vulnerable-person guidance: above 55 avoid strenuous outdoor activity for the next hour; above 150 avoid all outdoor activity for the next hour. No claim that lower values guarantee safety.
- Location comes from the message, or the stored home area only for explicit near-home requests. Unknown/ambiguous location prompts clarification. Approximate air region uses nearest published region label, not street-level exposure. Official English area names and 12 Mandarin aliases supported.
- Urgent health, digital safety, capability bounds, red risk, care signals and routing care-pause remain higher priority. Refusals bypass the outdoor tool even after a location question.
- Validated public responses cached in process for five minutes, four concurrent calls with 2.5-second request timeouts, no automatic request retries. Stale/invalid/missing data produces an explicit limitation. No personal data goes to government endpoints.
- Judge trail includes actual source links, resolved area, issue time and forecast validity. No new storage, provider call, autonomous agent, scheduler or outbound notification.

## Verification

Final commands exited 0:

```
vitest run src/lib/agents/environmentAdvisory.test.ts src/lib/persistence/seniorContextRepository.test.ts
Test Files 2 passed (2)
Tests 37 passed (37)
```

Changed-file ESLint: exit 0.

```
npm run build
Compiled successfully
Finished TypeScript
Generating static pages (24/24)
```

Independent code review found timing/forecast-coverage and refusal gaps. These were fixed with regression cases; the final refusal follow-up now shares the same refusal predicate before either routing branch. No Critical findings. The reviewer's unconfirmed concern about a national PSI metadata entry was resolved by the actual five-region public payload read during implementation.

No broad suite, paid inference, live database writes, authenticated browser checks or hosted full-chat demonstration were performed. Local fixtures do not prove hosted chat operation. Owner explicitly approved this commit's deployment and promotion with only Vercel's required build; both are complete.
