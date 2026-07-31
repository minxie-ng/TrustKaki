# TrustKaki Project Closeout

Last updated: 31 July 2026

This document is the live source of truth for taking TrustKaki from the current
verified build through hackathon submission and public portfolio release. Update
the status and evidence here after each major step. Historical implementation
plans remain under `docs/superpowers/` and are not active checklists.

Do not add credentials, Auth UUIDs, phone numbers, provider identifiers, message
payloads, API keys, or other secrets to this document.

## Current Verified State

- Branch: `main`
- Verified product release content commit: `78aa64e`
- Repository: `https://github.com/minxie-ng/TrustKaki`
- Vercel production: `https://trustkaki.vercel.app`
- EdgeOne production: `https://trustkaki.edgeone.dev`
- Vercel and EdgeOne release smoke checks pass for `/api/health`, `/privacy`,
  and `/data-deletion`.
- The authenticated guided demo completes all four steps on EdgeOne.
- Resolution clears the active queue and retains both the recorded follow-up
  and resolution history after refresh.
- `View recent activity` expands inline without opening another browser tab.
- The public `Explore demo` flow passed on Vercel and EdgeOne: all four steps,
  refresh persistence after Step 2, reset, and exit were manually accepted.
- The public demo uses fictional browser-only state, expires after two hours,
  and cannot call Supabase, LLM, messaging, webhook, scheduler, or processor
  routes.
- A temporary hackathon judge account is provisioned with the trusted
  `demo_admin` claim and direct access to exactly one fictional demo senior.
  Password sign-in, senior scope, and the live-demo transaction were verified;
  credentials are intentionally kept out of Git and belong only in the
  submitted deck.
- A fresh Vercel UI acceptance check on 30 July confirmed that the judge
  credentials sign in successfully, expose exactly one fictional senior,
  complete all four live-demo steps, retain the recorded response and resolved
  case after refresh, and produce no browser console errors. The verification
  session was signed out after completion.
- Production dependency audit: zero known vulnerabilities.
- Local quality evidence: 801 tests passed, 38 skipped; TypeScript, ESLint, and
  the Next.js production build passed.
- Vercel reports product commit `78aa64e1e2a5` healthy. Live-demo preparation now uses
  one bounded Supabase transaction measured at 29 ms in a rolled-back database
  check; duplicate guide-time polling and Realtime refreshes are suppressed,
  and caregiver action steps reconcile from persisted RPC metadata. Signed-in
  browser acceptance passed with Step 1 completing in approximately 5-6 seconds.
- The native Google Slides submission deck now contains 13 editable slides.
  Slide 2 now grounds the care gap in Singapore's 2026 super-aged status and
  the official projection that 1 in 4 citizens will be aged 65 or above by
  2030. The slide separates those sourced facts from TrustKaki's operational
  implications for attention prioritisation and handover continuity, and links
  the visible citation to the official Age Well SG source.
  Slide 9 now shows Triage as always-on and AAC Nudge, Digital Safety, and
  Context Memory as trigger-selected specialists, followed by authoritative
  deterministic policy, Pattern Watch, briefing, and the persisted care case.
  Slide 10 includes the accepted 18-case live metrics and the strict 9/18
  all-expectations limitation alongside release evidence. Slide 7 contains
  retained-timeline proof. Slide 12 contains the bounded three-person
  general-user usability results and explicitly states that the small sample is
  neither target-user nor clinical validation. Slide 13 provides the no-login
  and restricted live judge paths and links both
  the primary Vercel host and secondary Tencent EdgeOne deployment. Slide 1
  identifies Team SandSeed and Ng Min Xie as required by the submission brief.
  A full tone audit removed
  internal judging and presentation language and made Slide 1 a direct product
  definition with its senior, family-caregiver, and Active Ageing Centre staff
  audiences stated explicitly.
- The latest native deck exported successfully on 31 July as an editable PPTX
  (874,778 bytes) using the required filename
  `TrustKaki-Project Introduction Deck-SandSeed.pptx`. Uploading that export to
  the connected Google Drive is blocked only because the account storage quota
  is full; the credential-bearing export was not uploaded elsewhere.
- Ten high-severity audit findings remain in development-only ESLint tooling.
  npm currently offers only incompatible or incorrect major remediation paths.
  Do not run `npm audit fix --force`.
- The `main` branch contains a reproducible 42-case fictional benchmark
  across care, social, digital-safety, durable-context, benign, and
  protected-data scenarios. Its deterministic offline run measured 100.0%
  durable-context precision, 100.0% schema validity, 0.0% fallback, and no
  failed case IDs. Routing metrics are explicitly not measured offline.
- The approved bounded live run evaluated 18 fictional cases, three per
  category, with no persistence or messaging. It measured 88.9% route exact
  match, 100.0% required-specialist recall, 95.2% forbidden-specialist
  avoidance, 100.0% Digital Safety recall, 100.0% durable-context precision,
  100.0% schema validity, and 0.0% fallback. Nine strict failed case IDs remain
  disclosed in the evidence report.
- A bounded fictional-demo usability check with three general users recorded
  6/9 tasks completed without coaching, 3/3 completing the response,
  resolution, and retained-history task, a seven-minute median completion time,
  4.5/5 median ease, and 4/5 median confidence. The small convenience sample
  identified first-time discoverability of the case rationale and recommended
  action as the main improvement area. No AAC role was represented and relevant
  care experience was not established, so this is neither target-user nor
  clinical validation.
- The priority case now presents `Why this case was surfaced` and `Recommended
  human action` in the collapsed primary view. Both are semantically named
  regions and remain visible without opening the evidence timeline. Desktop and
  mobile browser checks passed without horizontal overflow or console errors;
  genuine target-user re-check remains.
- The chronological care timeline now admits recent senior messages and
  TrustKaki replies, labels persisted Telegram or WhatsApp origin, preserves a
  semantic event time, and exposes only bounded processing or delivery states.
  Raw phone, provider-message, webhook-update, and metadata identifiers remain
  server-side. Repository sanitization tests and 1440x1000 and 390x844 browser
  checks passed without console errors, framework overlays, or horizontal
  overflow.

## Deployment Responsibilities

### Vercel: primary production host

Vercel owns the complete judge and messaging deployment:

- authenticated caregiver workspace
- Supabase-backed persistence
- LLM and multi-agent orchestration
- WhatsApp and Telegram webhooks and outbound processing
- scheduled and protected internal processors
- primary rollback target

### EdgeOne: secondary full-stack deployment

EdgeOne demonstrates Tencent deployment and runs:

- authenticated caregiver workspace
- Supabase-backed persistence
- LLM and multi-agent orchestration
- guided demo and server route handlers

WhatsApp credentials, Telegram credentials, scheduler secrets, and processor
secrets remain intentionally absent from EdgeOne. This prevents duplicate
outbound messages and duplicate scheduled processing. Do not move messaging
webhooks or schedules from Vercel during closeout.

## Fixed Product Decisions

- Keep authentication for real caregiver workspaces.
- Never expose senior or caregiver records through an unauthenticated route.
- Add a separate one-click public demo using synthetic, isolated data.
- Public demo mode must not send real WhatsApp or Telegram messages.
- Public demo channel content must be clearly identified as simulated.
- Keep deterministic policy authoritative for risk and Pattern Watch decisions.
- Do not present TrustKaki as a clinical, diagnostic, or emergency-response
  system.
- Do not claim WorkBuddy usage that did not occur. State factually that the
  supplied account-credit path was unavailable through the accessible login
  flow.
- Do not publish judge credentials in GitHub, slides, videos, or social posts.

## Closeout Checklist

Status values: `TODO`, `IN PROGRESS`, `BLOCKED`, `DONE`.

| Order | Status | Workstream | Completion evidence |
| --- | --- | --- | --- |
| 1 | BLOCKED | Verify WhatsApp and Telegram on the final Vercel commit | Telegram passed on 29 July. On 31 July Meta access and WABA subscription recovered and a bounded WhatsApp inbound message completed TrustKaki processing without fallback, but Meta rejected outbound delivery with `131031`. Account Quality confirmed a permanent messaging restriction until formal business verification is completed. Exact Vercel authenticated UI capture also remains pending |
| 2 | DONE | Build one-click public demo mode | Commit `05b893e` is deployed on Vercel and EdgeOne; anonymous acceptance check passed for all four steps, refresh persistence, reset, and exit |
| 3 | DONE | Make channel origin visible in care evidence | Commit `78aa64e` is deployed on Vercel. Relevant inbound messages and TrustKaki replies show Telegram or WhatsApp source, semantic event time, and bounded processing/delivery state. Repository tests prove provider and phone identifiers are discarded before dashboard rendering; desktop and 390x844 browser checks passed |
| 4 | DONE | Complete final product QA | Transactional live-demo preparation and immediate persisted action reconciliation are deployed; signed-in timing acceptance passed at approximately 5-6 seconds for Step 1; the credential-free four-step path passed 390x844 mobile layout, real keyboard activation, retained-history, browser-error, and WCAG A/AA checks on Vercel commit `f478b3c` |
| 5 | DONE | Deploy the current product release | Product commit `78aa64e` is healthy on Vercel; Vercel and EdgeOne pass release smoke for health, privacy, and data-deletion routes; EdgeOne serves the repository artifact but does not expose its deployed commit ID through `/api/health` |
| 6 | IN PROGRESS | Capture channel proof | Verified Telegram screenshot is included in the deck; WhatsApp final provider proof remains blocked by Meta account access |
| 7 | DONE | Produce architecture and technical evidence | Reviewed Slides 9 and 10 explain channels, identity binding, orchestration, conditionally routed agents, deterministic policy, Pattern Watch, Supabase-backed operations, verification, Vercel, and EdgeOne |
| 8 | DONE | Build the hackathon slide deck | Native editable 13-slide Google deck passed visual and tone sweeps; Slide 2 includes sourced Singapore ageing context with a linked Age Well SG reference; internal judging language and layout defects were corrected; Team SandSeed and Ng Min Xie are identified on Slide 1 |
| 9 | DONE | Prepare the asynchronous judge path | Both production hosts separate no-login Explore demo from restricted Live backend access; a fresh Vercel check confirmed judge sign-in, one-senior scope, all four live steps, refresh persistence, retained activity, and no browser errors; Slide 13 contains the private access instructions plus clickable Vercel and Tencent EdgeOne links |
| 10 | DONE | Confirm final submission requirements | AI Agent/Skills track requires a web link or Skill ZIP and a project introduction deck; video is not required for this track |
| 11 | IN PROGRESS | Run the submission audit | Vercel and EdgeOne release smoke passed; judge access passed; the editable PPTX exported successfully with the required filename, but the connected Drive rejected its upload because the account storage quota is full; the official event page confirms the AI Agent track and 9 August deadline; exact portal fields and cutoff time remain to be checked in the participant-only submission flow |
| 12 | TODO | Prepare the public GitHub release | README, setup, architecture, screenshots, license, limitations, contribution/security notes, and secret scan are complete |
| 13 | IN PROGRESS | Publish portfolio material | Public demo and repository are live; the credential-free product video, social copy, screenshots, and technical summary are being prepared under the hackathon publicity rules |
| 14 | TODO | Complete post-demo cleanup | Temporary access and test records are handled according to the release runbook; judge credentials are rotated or disabled when appropriate |

## Top-One Scoring Sprint

The official preliminary rubric weights Impact and Relevance at 30 points, Use
of AI Tools at 40 points, and Project Quality at 30 points, with a five-point
social-reach bonus. The strict current evidence-based baseline is 82/100 plus
0/5 bonus. The target is a credible 91-95/100 base score plus the bonus; this is
a planning target, not a promised judging result.

The approved design is recorded in
`docs/superpowers/specs/2026-07-30-top-one-submission-sprint-design.md`.

| Order | Status | Scoring workstream | Completion evidence |
| --- | --- | --- | --- |
| A | DONE | Correct conditional multi-agent evidence | Slide 9 states that Triage always runs; AAC Nudge, Digital Safety, and Context Memory are available only for their stated triggers; deterministic safety policy remains authoritative |
| B | DONE | Build the synthetic AI benchmark | The committed 42-case fictional dataset, strict validation, scoring tests, real fallback tests, and bounded CLI cover six categories; the offline report is reproducible with `npm run benchmark:agents` |
| C | DONE | Publish reproducible AI evidence | `docs/evidence/2026-07-30-agent-benchmark.md` records the sanitized 42-case offline and approved 18-case live results with failed IDs; Slide 10 matches the live sample and headline metrics exactly |
| D | DEFERRED | Run bounded target-user validation | Three general users completed a fictional-demo usability check; the resulting rationale/action discoverability improvement is implemented, tested, and recorded on Slide 12. Additional target-user testing was deliberately deferred on 30 July, so this evidence remains general usability feedback and is not described as AAC, target-user, or clinical validation |
| E | BLOCKED | Add legitimate WorkBuddy evidence | If account access becomes available, one fictional AAC handover workflow is recorded; otherwise no WorkBuddy usage is claimed |
| F | IN PROGRESS | Produce video and social proof | The approved credential-free 110-second demonstration was exported as a verified 1920x1080 MP4 with H.264 video and stereo AAC narration; full decode and eight-scene sampling passed. Completion requires the published video URL and a qualifying post with the handbook's required hashtags |
| G | TODO | Complete top-one submission controls | Mobile and keyboard QA pass; the PPTX uses the required filename; participant-only form fields and cutoff are confirmed; submission is accepted by 7 August |

## Immediate Next Workstream

Telegram final-commit verification passed on 29 July. The bounded evidence is
recorded in
`docs/superpowers/verification/2026-07-29-final-channel-verification.md`.
WhatsApp Meta account access recovered on 31 July and the TrustKaki app was
successfully re-subscribed to its existing WABA. The bounded live retry proved
that inbound webhook, orchestration, persistence, and Meta send acceptance work,
but Meta rejected delivery with provider error `131031` (`Business Account
locked`). Account Quality then confirmed that the WhatsApp Business Account has
a permanent restriction against starting conversations, responding, and adding
phone numbers until formal business verification is completed. Treat this as an
external account-quality blocker; do not rotate credentials, change application
code, or submit unverifiable business documents for it.

The general-user validation finding has already been implemented and verified.
Further target-user testing is deferred and does not block submission. Video
and social publication were deliberately postponed on 31 July; the verified
MP4 remains ready. Mobile and keyboard QA and channel-origin presentation are
complete. Next confirm the required PPTX filename and participant-only
submission fields before final release and submission checks.
Keep WhatsApp restoration and WorkBuddy access as separate blocked tasks that
do not hold up submission.

For item 11, keep the credential-bearing native Google Slides source private.
The current editable PPTX export passed and uses the required filename, but its
temporary Drive upload is blocked by the connected account's full storage
quota. Free at least 1 MB of Drive storage or download the PPTX directly from
Google Slides, then upload it only to the private submission portal. The public
event page confirms the AI Agent track, identifies WorkBuddy as a recommended
rather than mandatory tool, and gives 9 August as the deadline. It does not
expose the participant-only submission fields or exact cutoff time, so those
must be checked directly in the organiser-provided portal or announcement
before item 11 can be marked done.

When WhatsApp access is restored, verify only one approved fictional test flow:

1. Receive one inbound message through the real provider webhook.
2. Confirm one policy-controlled response.
3. Confirm the event and agent result persist in Supabase.
4. Confirm provider retry or duplicate delivery does not create duplicate work.
5. Confirm the authenticated dashboard shows the resulting care evidence.
6. Record pass/fail, commit, deployment, time, and bounded counts only.

Do not record message bodies, destinations, provider identifiers, or payloads in
the repository.

## One-Click Demo Acceptance Criteria

- The sign-in screen keeps the normal authenticated path.
- `Explore demo` creates or opens a per-visitor synthetic demo session.
- No public visitor can read or mutate another visitor's state.
- No public visitor can read or mutate authenticated production care records.
- Demo mutations are deterministic browser-only transitions; they reuse the
  real dashboard presentation but do not exercise production APIs.
- Real provider sends, webhooks, schedules, and paid external side effects are
  disabled in demo mode.
- Public demo mode makes no AI request and has no external side effect.
- `Reset demo` restores a known fictional starting state.
- Demo state expires or is cleaned up automatically.
- The interface clearly distinguishes simulated channel content from live
  provider evidence.
- Desktop and mobile flows pass before public sharing.

## Judge Demonstration Structure

Target a short, evidence-led sequence:

1. Show the verified Telegram exchange recording.
2. Open the live care workspace.
3. Prepare the four-day history and show the consolidated priority case.
4. Explain observed facts, usual-context comparison, deterministic Pattern
   Watch, and the recommended human action.
5. Record the caregiver response and resolve the case.
6. Show the cleared queue and retained activity history.
7. Show the architecture slide and identify what runs on Vercel, EdgeOne,
   Supabase, and the LLM provider.

Use Telegram as the primary recorded proof. Describe WhatsApp as implemented
but not final-verified because Meta account access was blocked; do not depend
on a live provider send as the only judge path.

## Slide Deck Outline

1. TrustKaki introduction
2. The care gap
3. Shared care context
4. Message-to-action workflow
5. Telegram production proof
6. Pattern Watch and explainable triage
7. Accountable human follow-up
8. Public-demo isolation
9. Multi-agent control flow
10. Engineering proof
11. Vercel and Tencent EdgeOne deployment responsibilities
12. Impact, boundaries, and next steps
13. Judge access and temporary live credentials

## Public Release Checklist

- Confirm hackathon rules allow publication before posting.
- Use `https://trustkaki.edgeone.dev` rather than a deployment-specific EdgeOne
  URL in public materials.
- Keep the Vercel URL as the primary operational deployment.
- Remove or redact credentials, identifiers, dashboards, logs, and browser
  autofill from every screenshot and recording.
- Run a repository secret scan before making promotional claims.
- Document that all visible senior data is fictional.
- Document demo-mode limitations and disabled external delivery.
- Add a license before inviting reuse.
- Verify social-preview image, title, description, and public links.
- Publish GitHub and demo links only after the final release passes smoke and
  authenticated verification.

## Closeout Definition

TrustKaki is closed for the hackathon when:

- the final submission is accepted with working links;
- the judge demo has a verified live path and a recorded fallback;
- WhatsApp and Telegram claims are supported by bounded evidence;
- the public demo cannot expose data or trigger real messaging;
- the repository contains no secrets or private credentials;
- slides, architecture, and technical evidence match the deployed build;
- temporary judge access and demo data have an explicit cleanup decision; and
- public portfolio materials accurately distinguish implemented, simulated,
  deferred, and blocked capabilities.
