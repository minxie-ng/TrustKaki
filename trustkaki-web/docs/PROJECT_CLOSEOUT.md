# TrustKaki Project Closeout

Last updated: 30 July 2026

This document is the live source of truth for taking TrustKaki from the current
verified build through hackathon submission and public portfolio release. Update
the status and evidence here after each major step. Historical implementation
plans remain under `docs/superpowers/` and are not active checklists.

Do not add credentials, Auth UUIDs, phone numbers, provider identifiers, message
payloads, API keys, or other secrets to this document.

## Current Verified State

- Branch: `main`
- Verified commit: `ae9c0d4` (`feat: clarify asynchronous judge demo access`)
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
- Local quality evidence: 774 tests passed, 38 skipped; TypeScript, ESLint, and
  the Next.js production build passed.
- Vercel reports commit `ae9c0d497f86` healthy. Live-demo preparation now uses
  one bounded Supabase transaction measured at 29 ms in a rolled-back database
  check; duplicate guide-time polling and Realtime refreshes are suppressed,
  and caregiver action steps reconcile from persisted RPC metadata. Signed-in
  browser acceptance passed with Step 1 completing in approximately 5-6 seconds.
- The native Google Slides submission deck now contains 13 editable slides.
  Slide 9 uses a concrete senior-message example to show four specialist-agent
  contributions, safety control, pattern detection, the caregiver briefing,
  and the persisted care case; Slide 10 provides engineering evidence. Slide 7
  contains retained-timeline proof; Slide 13 provides the
  no-login and restricted live judge paths. Slide 1 identifies Team SandSeed
  and Ng Min Xie as required by the submission brief. A full tone audit removed
  internal judging and presentation language and made Slide 1 a direct product
  definition with its senior, family-caregiver, and Active Ageing Centre staff
  audiences stated explicitly.
- Ten high-severity audit findings remain in development-only ESLint tooling.
  npm currently offers only incompatible or incorrect major remediation paths.
  Do not run `npm audit fix --force`.
- The agent-evidence branch contains a reproducible 42-case fictional benchmark
  across care, social, digital-safety, durable-context, benign, and
  protected-data scenarios. Its deterministic offline run measured 100.0%
  durable-context precision, 100.0% schema validity, 0.0% fallback, and no
  failed case IDs. Routing metrics are explicitly not measured offline.

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
| 1 | BLOCKED | Verify WhatsApp and Telegram on the final Vercel commit | Telegram passed on 29 July; WhatsApp is blocked by Meta OAuth error 200; exact Vercel authenticated UI capture remains pending |
| 2 | DONE | Build one-click public demo mode | Commit `05b893e` is deployed on Vercel and EdgeOne; anonymous acceptance check passed for all four steps, refresh persistence, reset, and exit |
| 3 | TODO | Make channel origin visible in care evidence | Relevant timeline items show WhatsApp or Telegram source, event time, and bounded delivery/processing state without exposing identifiers |
| 4 | IN PROGRESS | Complete final product QA | Transactional live-demo preparation and immediate persisted action reconciliation are deployed; signed-in timing acceptance passed at approximately 5-6 seconds for Step 1; keyboard, desktop, and mobile checks remain |
| 5 | DONE | Deploy the current public-demo release | Commit `ae9c0d4` is healthy on Vercel; EdgeOne serves the updated judge entry but does not expose its deployed commit ID through `/api/health` |
| 6 | IN PROGRESS | Capture channel proof | Verified Telegram screenshot is included in the deck; WhatsApp final provider proof remains blocked by Meta account access |
| 7 | DONE | Produce architecture and technical evidence | Reviewed Slides 9 and 10 explain channels, identity binding, orchestration, conditionally routed agents, deterministic policy, Pattern Watch, Supabase-backed operations, verification, Vercel, and EdgeOne |
| 8 | DONE | Build the hackathon slide deck | Native editable 13-slide Google deck passed visual and tone sweeps; internal judging language and layout defects were corrected; Team SandSeed and Ng Min Xie are identified on Slide 1 |
| 9 | DONE | Prepare the asynchronous judge path | Both production hosts separate no-login Explore demo from restricted Live backend access; a fresh Vercel check confirmed judge sign-in, one-senior scope, all four live steps, refresh persistence, retained activity, and no browser errors; Slide 13 contains the private access instructions |
| 10 | DONE | Confirm final submission requirements | AI Agent/Skills track requires a web link or Skill ZIP and a project introduction deck; video is not required for this track |
| 11 | IN PROGRESS | Run the submission audit | Vercel and EdgeOne release smoke passed; judge access passed; the official event page confirms the AI Agent track and 9 August deadline; exact portal fields and cutoff time remain to be checked in the participant-only submission flow |
| 12 | TODO | Prepare the public GitHub release | README, setup, architecture, screenshots, license, limitations, contribution/security notes, and secret scan are complete |
| 13 | TODO | Publish portfolio material | Public demo, repository, video, LinkedIn copy, screenshots, and technical summary are ready and comply with hackathon publicity rules |
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
| A | IN PROGRESS | Correct conditional multi-agent evidence | Slide 9 states that the coordinator selects relevant specialists; the appetite-and-knee-pain example does not claim Digital Safety or Context Memory ran without their triggers |
| B | DONE | Build the synthetic AI benchmark | The committed 42-case fictional dataset, strict validation, scoring tests, real fallback tests, and bounded CLI cover six categories; the offline report is reproducible with `npm run benchmark:agents` |
| C | IN PROGRESS | Publish reproducible AI evidence | `docs/evidence/2026-07-30-agent-benchmark.md` records the sanitized 42-case offline result and failed IDs; the pending bounded live run and exact deck metric update remain |
| D | TODO | Run bounded target-user validation | Three to five participants complete the fictional review tasks; role category, task success, timing, and non-personal usability findings are recorded |
| E | BLOCKED | Add legitimate WorkBuddy evidence | If account access becomes available, one fictional AAC handover workflow is recorded; otherwise no WorkBuddy usage is claimed |
| F | TODO | Produce video and social proof | A credential-free 90-120 second demonstration is published with the handbook's required hashtags and earns the available bonus evidence |
| G | TODO | Complete top-one submission controls | Mobile and keyboard QA pass; the PPTX uses the required filename; participant-only form fields and cutoff are confirmed; submission is accepted by 7 August |

## Immediate Next Workstream

Telegram final-commit verification passed on 29 July. The bounded evidence is
recorded in
`docs/superpowers/verification/2026-07-29-final-channel-verification.md`.
WhatsApp remains blocked by Meta account access and must not hold up independent
closeout work.

After explicit usage approval, run the 18-case live agent benchmark next, using
three fictional cases from each category and no Supabase or messaging calls.
Review its failed IDs before accepting any metric for the deck. Then correct
Slide 9's conditional-routing wording and add at most three live metrics to
Slide 10. Keep the WhatsApp restoration attempt as a separate blocked task.

For item 11, keep the credential-bearing native Google Slides source private
and upload its current PPTX export to the submission portal. The public event
page confirms the AI Agent track, identifies WorkBuddy as a recommended rather
than mandatory tool, and gives 9 August as the deadline. It does not expose the
participant-only submission fields or exact cutoff time, so those must be
checked directly in the organiser-provided portal or announcement before item
11 can be marked done.

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
