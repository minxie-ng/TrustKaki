# Outdoor conditions tool — local implementation

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


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


## Reported outdoor-plan routing defect and local correction

The owner reported “i am going for a walk in bedok” produced a knee-care reminder without an Outdoor Conditions Tool trace. The screenshot shows activity handling blocked; the exact saved hosted model outputs were not inspected.

Offline orchestration reproduced the failure with that exact message and (a) a nonurgent health/daily-living signal or (b) a Jev care uncertainty. Both weather eligibility checks (`!triageCare` and `!routes.carePause`) incorrectly treated factual conditions as an activity invitation. Three regression scenarios failed before the correction.

Correction removes only those two weather gates, retains the existing care response/clarification first, then appends factual government advice. Urgent health, digital safety, capability bounds and red-risk suppression remain. Policy risk, alerts, memory and briefing decisions are unchanged. Refusal still prevents a weather call. The tool trace receives `care_reply_preserved` where appropriate, and the selected response retains the triage/policy identity for care-led responses.

Verification: seven offline orchestration regressions and 18 tool tests passed (25 total); changed-file ESLint and production build exited 0. Independent review found no Important blockers. No paid inference, live records or hosted chat checks. Owner approved this correction as `09afd8c`; it was pushed to GitHub main and Vercel status reported deployment completed. The owner's subsequent screenshot confirms weather/air advice appears with the care reply.


## Conversational presentation correction (local, pending release)

The owner reported the resulting reply was robotic. The model's Triage prompt was running, but it could not influence the later deterministic data-report paragraphs. Raw regional readings, repeated timestamps and source footer were appended directly to the senior-facing message.

Ordinary replies now use brief conversational forecasts and the same bounded NEA air advice. Full numeric values, source URLs, issue times, regional scope and forecast validity remain in structured evidence and the existing source panel. Explicit requests for PSI/PM2.5 still receive exact readings; explicit air-quality questions receive a qualitative answer even below the advisory threshold. Mandarin weather categories use bounded translations.

The Triage system prompt now asks for everyday, short replies without repetitive praise or generic help endings, and prohibits turning a background condition or ordinary walking plan into an invented new symptom/social signal. Model adherence and perceived warmth have not been evaluated through paid inference in this change.

Verification: 52 focused offline tests across environment tool, outdoor-care orchestration and prompts passed; changed-file ESLint and production build exited 0. Review identified a missing normal-band answer for explicit air-quality questions; this was fixed with a regression case. Freshness, departure coverage, health advice thresholds and urgent/safety handling are unchanged. No additional model call or paid provider is introduced. GitHub main push / Vercel automatic deployment awaits exact commit approval.
