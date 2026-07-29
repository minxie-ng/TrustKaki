# TrustKaki Project Closeout

Last updated: 29 July 2026

This document is the live source of truth for taking TrustKaki from the current
verified build through hackathon submission and public portfolio release. Update
the status and evidence here after each major step. Historical implementation
plans remain under `docs/superpowers/` and are not active checklists.

Do not add credentials, Auth UUIDs, phone numbers, provider identifiers, message
payloads, API keys, or other secrets to this document.

## Current Verified State

- Branch: `main`
- Verified commit: `03331c9` (`fix: patch production dependency vulnerabilities`)
- Repository: `https://github.com/minxie-ng/TrustKaki`
- Vercel production: `https://trustkaki.vercel.app`
- EdgeOne production: `https://trustkaki.edgeone.dev`
- Vercel and EdgeOne release smoke checks pass for `/api/health`, `/privacy`,
  and `/data-deletion`.
- The authenticated guided demo completes all four steps on EdgeOne.
- Resolution clears the active queue and retains both the recorded follow-up
  and resolution history after refresh.
- `View recent activity` expands inline without opening another browser tab.
- Production dependency audit: zero known vulnerabilities.
- Local quality evidence: 756 tests passed, 38 skipped; TypeScript, ESLint, and
  the Next.js production build passed.
- Ten high-severity audit findings remain in development-only ESLint tooling.
  npm currently offers only incompatible or incorrect major remediation paths.
  Do not run `npm audit fix --force`.

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
| 1 | TODO | Verify WhatsApp and Telegram on the final Vercel commit | One approved fictional inbound event per channel; webhook, policy-controlled reply, persistence, deduplication, and dashboard refresh verified |
| 2 | TODO | Build one-click public demo mode | Anonymous visitor reaches isolated synthetic workspace; reset works; real outbound messaging is disabled; visitors cannot affect each other or production records |
| 3 | TODO | Make channel origin visible in care evidence | Relevant timeline items show WhatsApp or Telegram source, event time, and bounded delivery/processing state without exposing identifiers |
| 4 | TODO | Complete final product QA | Authentication, guided demo, queue, history, errors, loading states, refresh persistence, keyboard use, desktop, and mobile pass |
| 5 | TODO | Deploy the final application release | Exact commit is Running/Ready on Vercel and EdgeOne; both release smoke checks and authenticated demo verification pass |
| 6 | TODO | Capture channel proof | Short real-flow recordings or screenshots exist for WhatsApp and Telegram with identifiers and credentials removed |
| 7 | TODO | Produce architecture and technical evidence | Diagram and concise evidence explain channels, webhooks, agents, deterministic policy, Supabase, dashboard, Vercel, and EdgeOne |
| 8 | TODO | Build the hackathon slide deck | Final deck covers problem, user, workflow, demonstration, architecture, AI design, safety, impact, deployment, limitations, and roadmap |
| 9 | TODO | Prepare and rehearse the pitch | Timed primary script, backup path, speaker cues, and judge-account instructions are ready |
| 10 | TODO | Record the submission video | Final product recording is within the allowed duration, legible, captioned, and uses the final deployment |
| 11 | TODO | Run the submission audit | Brief, required fields, technologies, links, permissions, credentials delivery, file formats, and deadlines are checked |
| 12 | TODO | Prepare the public GitHub release | README, setup, architecture, screenshots, license, limitations, contribution/security notes, and secret scan are complete |
| 13 | TODO | Publish portfolio material | Public demo, repository, video, LinkedIn copy, screenshots, and technical summary are ready and comply with hackathon publicity rules |
| 14 | TODO | Complete post-demo cleanup | Temporary access and test records are handled according to the release runbook; judge credentials are rotated or disabled when appropriate |

## Immediate Next Workstream

Start with the final-commit channel verification on Vercel. Follow the approval
and evidence boundaries in `docs/operations/HACKATHON_RELEASE_RUNBOOK.md`.

For each channel, verify only an approved fictional test flow:

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
- Demo mutations exercise the real product workflow where practical.
- Real provider sends, webhooks, schedules, and paid external side effects are
  disabled in demo mode.
- AI use is bounded by rate limits and a defined fallback.
- `Reset demo` restores a known fictional starting state.
- Demo state expires or is cleaned up automatically.
- The interface clearly distinguishes simulated channel content from live
  provider evidence.
- Desktop and mobile flows pass before public sharing.

## Judge Demonstration Structure

Target a short, evidence-led sequence:

1. Show a brief real WhatsApp or Telegram exchange recording.
2. Open the live care workspace.
3. Prepare the four-day history and show the consolidated priority case.
4. Explain observed facts, usual-context comparison, deterministic Pattern
   Watch, and the recommended human action.
5. Record the caregiver response and resolve the case.
6. Show the cleared queue and retained activity history.
7. Show the architecture slide and identify what runs on Vercel, EdgeOne,
   Supabase, and the LLM provider.

Use one channel as the primary recorded proof and show bounded evidence for the
second channel. Do not depend on a live provider send as the only judge path.

## Slide Deck Outline

1. TrustKaki and the last-mile ageing problem
2. Target users: seniors, caregivers, and AAC staff
3. Why ordinary chatbots and isolated alerts are insufficient
4. End-to-end senior-to-human workflow
5. Live product demonstration
6. Multi-agent and deterministic-policy architecture
7. Pattern Watch and explainable evidence over time
8. WhatsApp and Telegram integration proof
9. Data boundaries, human oversight, privacy, and safety
10. Supabase persistence and operational backend evidence
11. Vercel and Tencent EdgeOne deployment
12. Expected social impact, limitations, and next steps

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
- slides, video, architecture, and technical evidence match the deployed build;
- temporary judge access and demo data have an explicit cleanup decision; and
- public portfolio materials accurately distinguish implemented, simulated,
  deferred, and blocked capabilities.
