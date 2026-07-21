# Gate 8 Hackathon Release Readiness Design

**Date:** 2026-07-21

**Status:** Approved design for implementation planning

## Objective

Approve one controlled TrustKaki release for hackathon judging. The release must
make the authenticated caregiver workflow demonstrable, observable, reversible,
and honest about transport limitations without claiming readiness for a real AAC
pilot.

## Scope

Gate 8 will:

- keep Vercel as the judged application target and Supabase as the persistence,
  authentication, scheduling, and policy data boundary;
- preserve Telegram as the reliable live-demo transport while making one bounded
  attempt to restore WhatsApp linking;
- extend the public health response with sanitized readiness booleans for the
  Telegram fallback and proactive-check-in scheduler;
- add a local deployment smoke command that checks only public, non-mutating
  endpoints and never accepts or prints credentials;
- document deployment, rollback, incident handling, judge access, demo fallback,
  and go/no-go criteria in one concise release runbook;
- verify the deployed authenticated workflow manually at an explicit deployment
  checkpoint;
- complete a final independent security/privacy audit before release approval.

Gate 8 will not:

- approve real senior data, a real AAC pilot, or unattended care operations;
- add enterprise monitoring, paging, roster administration, or a new hosting
  platform;
- replace deterministic policy authority, persistence, tenancy, or the existing
  messaging adapters;
- expose technical traces to normal caregivers;
- require WhatsApp success when Telegram passes the controlled fallback criteria;
- perform deployment, webhook registration, outbound messaging, or credential
  changes without explicit user approval at the relevant checkpoint.

## Approach

### 1. Sanitized readiness model

The existing `/api/health` route remains public, read-only, and non-mutating. Its
critical status continues to represent the core judged web path: application,
Supabase public configuration, Supabase service configuration, required database
tables, and LLM configuration.

The response will add booleans for:

- Telegram webhook and outbound configuration;
- Telegram recovery processor configuration;
- proactive-check-in scheduler configuration;
- WhatsApp configuration and WhatsApp recovery configuration, retained as
  optional transport readiness.

No environment value, account identifier, phone number, chat identifier, URL with
credentials, provider payload, or error detail will be returned. Optional
transport failure must not turn a healthy Telegram-backed judge deployment into a
503 response.

### 2. Deployment smoke command

A small Node.js script will accept a deployment base URL as its only input. It
will reject non-HTTP(S) URLs, call only public GET endpoints, apply request
timeouts, validate response shape, and print a short pass/fail summary containing
no response bodies or secrets.

The initial checks are:

- `/api/health` returns HTTP 200 and the expected sanitized structure;
- `/privacy` returns a successful HTML response;
- `/data-deletion` returns a successful HTML response.

Authenticated senior data, demo resets, retry processors, webhooks, and outbound
providers are excluded from this script. Those operations require separate,
explicitly approved verification.

### 3. Release runbook

One Gate 8 runbook will be the operational source of truth. It will define:

- pre-deployment validation and migration-history checks;
- required environment-variable names without values;
- the deployment and public smoke sequence;
- private judge-account handling and post-event credential rotation;
- manual authenticated checks for sign-in, senior isolation, case workflow,
  context, contact masking, and demo-admin-only controls;
- Telegram primary-demo verification and WhatsApp retry criteria;
- rollback to the last verified Vercel deployment;
- incident stop conditions and evidence capture without sensitive payloads;
- final release go/no-go criteria.

The project owner is the release operator for the hackathon. The release operator
stops the demo, disables affected webhook or schedule activity where applicable,
and rolls back when a stop condition occurs. This role assignment is for the
controlled hackathon release only and is not an AAC operating model.

### 4. Explicit live checkpoints

Implementation and local validation are non-live. The following actions remain
separate approval checkpoints:

1. inspect linked Vercel and Supabase project metadata without printing secrets;
2. deploy or promote the selected commit;
3. register or change Telegram or Meta webhook configuration;
4. send a real Telegram or WhatsApp message;
5. invoke a protected retry processor or proactive-check-in run;
6. rehearse a real Vercel rollback or restore the release afterward.

WhatsApp restoration is successful only when inbound signature verification,
durable acceptance, identity mapping, orchestration, persisted dashboard update,
and one outbound reply are observed. A Meta account or credential failure is
recorded as a provider limitation, not hidden or worked around by weakening
verification.

## Security And Privacy

- Health and smoke output remains boolean or bounded public metadata only.
- The smoke script never reads `.env` files or accepts tokens.
- Judge credentials remain private and are not written to documentation, shell
  history, screenshots, logs, or Git.
- Production simulator routes remain disabled and privileged routes retain their
  existing server-side authorization.
- Logs and verification notes must not contain raw phone numbers, Telegram chat
  IDs, destinations, access tokens, webhook secrets, provider payloads, or senior
  message content beyond pre-approved fictional demo text.
- The final audit covers the complete release diff plus existing auth, tenancy,
  trace, redaction, retry, and rollback boundaries affected by release operation.

## Error Handling

- Public smoke checks fail closed on timeout, malformed JSON, unexpected content
  type, non-2xx status, or missing required readiness fields.
- Optional WhatsApp readiness is reported separately from core release health.
- Deployment is not approved while the core health route is degraded.
- Any authenticated isolation failure, exposed secret, unmasked destination,
  uncontrolled outbound send, policy inconsistency, or failed rollback is an
  immediate no-go.
- Telegram failure is a no-go unless WhatsApp has independently passed the full
  controlled transport verification.

## Testing

Focused automated tests will cover:

- health-response status semantics and sanitized readiness fields;
- absence of secret values and sensitive identifiers in health output;
- smoke-script URL validation, timeout behavior, response validation, and concise
  output using a local fake server or injected fetch boundary;
- deployment hardening for all current TrustKaki API routes;
- production simulator restrictions and protected internal processors;
- runbook guard assertions where a stable machine-checkable rule is valuable.

The complete unit suite, TypeScript check, ESLint, and production build must pass.
Live evidence is recorded separately and cannot be replaced by unit tests.

## Release Decision

Gate 8 receives `GO FOR HACKATHON DEMO` only when:

- the selected commit is deployed and matches the recorded commit SHA;
- public health and smoke checks pass;
- the authenticated judge workflow passes without cross-senior leakage;
- Telegram or WhatsApp passes one real controlled end-to-end message;
- deterministic policy remains authoritative and normal caregivers receive no
  technical trace data;
- rollback steps are verified or explicitly rehearsed against an isolated
  preview before production promotion;
- the final independent audit has no unresolved Critical or Important findings;
- synthetic fixtures and temporary test state are removed;
- the release operator accepts the documented residual risks.

The decision wording must remain limited to the hackathon demonstration. It does
not authorize real senior onboarding or an AAC pilot.
