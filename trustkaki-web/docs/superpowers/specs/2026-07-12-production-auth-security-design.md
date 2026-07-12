# TrustKaki Production Authentication and Security Design

## Objective

Make TrustKaki safe to deploy as a real caregiver product while preserving a smooth, credible judge demonstration. Every request involving senior data or privileged work must be authenticated, authorized for a specific caregiver-to-senior relationship, validated, and bounded.

## Authentication Experience

TrustKaki will use Supabase Auth email/password sessions. The public application will show a sign-in page and will not expose public sign-up. Judges receive credentials for a dedicated judge account through judging instructions rather than through the deployed application.

The judge account is an ordinary authenticated caregiver linked to the demo senior. Its Supabase `app_metadata.role` is `demo_admin`, which additionally permits demo reset and replay operations. Production caregiver accounts do not receive that role. Sign-out invalidates the local session and returns the user to sign-in.

## Identity and Authorization Model

`caregivers` gains a nullable, unique `auth_user_id` foreign key to `auth.users(id)`. It is nullable so WhatsApp/AAC contacts may exist before receiving a product login. A signed-in user maps to exactly one caregiver through this field.

Access to a senior is derived from `senior_caregivers`: the authenticated user's caregiver row must have a relationship row for the requested senior. The browser and API must never accept an acting caregiver identity as authoritative input. Identity is derived from the verified Supabase user.

Demo administration is based only on trusted `app_metadata.role`, never user-editable metadata. The role grants demo reset/replay permission; it does not bypass caregiver-to-senior scoping for ordinary data access.

## Database Security

The existing anonymous `using (true)` policies will be removed. Authenticated RLS policies will scope every exposed table through the caregiver relationship:

- `seniors`: direct `senior_caregivers` relationship.
- `caregivers`: the user's own caregiver row, plus caregivers sharing an authorized senior when needed for assignment display.
- `senior_caregivers`: rows for seniors accessible to the authenticated caregiver.
- Senior-owned records such as messages, check-ins, alerts, briefs, risk events, patterns, queue items, actions, and jobs: their `senior_id`, or a parent record's senior, must be accessible.
- Agent runs and detected signals: access is inherited through their check-in.
- WhatsApp inbox records remain inaccessible to browser roles.

The service-role key remains server-only. RLS still protects browser access, while server routes independently enforce authorization before using privileged repository functions. This defense-in-depth avoids treating possession of an API URL as authorization.

A new migration will amend the deployed schema instead of rewriting historical migrations. It will remove anonymous policies, add the identity link and indexes, and install relationship-scoped policies. The seed documentation will explain how to link the judge Auth user without storing credentials or password hashes in Git.

## Server Request Authentication

A server auth helper will create a cookie-aware Supabase server client and call `auth.getUser()` for authoritative verification. Protected route helpers return consistent `401 Unauthorized` and `403 Forbidden` responses without leaking provider details.

Routes are classified as follows:

- Public: health check and Meta webhook verification/delivery. WhatsApp delivery retains signature verification.
- Internal secret: WhatsApp pending-event processor.
- Authenticated caregiver: dashboard state, queue actions, and agent endpoints.
- Demo admin: reset, Quick Demo, and Full Agent Replay.
- Development simulator: existing development flag plus authenticated demo-admin authorization.

Dashboard and repository operations receive the authenticated caregiver identity and scope all service-role queries to accessible senior IDs. Queue mutations verify that the selected item belongs to an accessible senior. Assignment targets must also share authorization for that senior.

## Input and Abuse Protection

All JSON route bodies will use Zod schemas with bounded string and collection lengths. Invalid JSON or schema failures return `400`; oversized payloads return `413` where detectable. The agent routes will share the existing orchestration input schema or equivalent specialist schemas rather than relying on TypeScript assertions.

An in-process bounded rate limiter will protect paid agent/demo endpoints for the MVP, keyed by authenticated user and route. It provides immediate abuse protection but is explicitly documented as single-instance only. Before multi-instance production scaling, it should be replaced by a shared durable limiter such as Redis or a platform rate-limit service.

The LLM provider will use `AbortSignal.timeout` with a configurable, bounded timeout and will distinguish timeout failures without returning secrets or raw provider bodies in production. Prompt and response token bounds remain enforced.

## Demo Reset Consistency

Reset must not report success after partial deletion. The preferred implementation is a database function that performs the demo reset transactionally and is callable only by the service role. The function is placed in a non-exposed private schema where supported, has an explicit `search_path`, and has execution revoked from `PUBLIC`, `anon`, and `authenticated`.

If the deployed environment cannot expose the private RPC through the current client configuration, the repository fallback must inspect every Supabase mutation result and fail on any error. It must never silently accept partial deletion. The migration and tests will make the transactional path the intended production behavior.

## UI Behavior

The root experience will hydrate the Supabase session before loading dashboard data. Unauthenticated users see a focused email/password sign-in form. Authentication errors are actionable but do not reveal whether an account exists. Authenticated users see the existing dashboard plus a sign-out control and their caregiver display name.

The UI handles `401` by returning to sign-in and handles `403` with a clear access-denied state. Demo controls are rendered only for a verified `demo_admin`, but server authorization remains mandatory even when controls are hidden.

## Testing Strategy

Implementation follows test-first development. Tests will cover:

- Unauthenticated requests receive `401` on every protected route.
- Authenticated caregivers can read only linked senior data.
- Cross-caregiver queue IDs receive `403` or `404` without leaking existence.
- Acting caregiver and assignment identity cannot be forged from request input.
- Demo operations require `demo_admin` app metadata.
- Anonymous database policies are removed and migration policies contain relationship predicates.
- Reset surfaces deletion/RPC failures rather than returning success.
- Agent schemas reject malformed and oversized payloads.
- Rate limits reject excess calls with `429` and appropriate retry metadata.
- LLM calls abort after the configured timeout.
- Sign-in, sign-out, loading, unauthorized, and access-denied UI states behave correctly.

The completion gate is the full Vitest suite, TypeScript, ESLint, production build, migration/static security checks, and a manual authenticated browser smoke test when valid local Supabase credentials are available.

## Deployment and Judge Setup

Deployment setup requires creating the judge user in Supabase Auth, setting `app_metadata.role` to `demo_admin` through an administrator-controlled path, and linking its user UUID to the seeded caregiver. Credentials are distributed privately and rotated or disabled after judging.

Public sign-up remains disabled. Production onboarding of caregivers is an administrator workflow outside this change. Environment documentation will distinguish browser-safe Supabase values from the service-role secret and will include the LLM timeout and rate-limit configuration.

## Non-Goals

- Public self-service registration or password-reset product flows.
- Multi-tenant organization administration UI.
- A distributed rate-limit service in this repository.
- Changing WhatsApp's trusted ingestion model.
- Replacing the existing agent orchestration or deterministic safety policy.

