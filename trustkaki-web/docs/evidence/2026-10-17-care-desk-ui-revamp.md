# Care Desk UI revamp — local implementation

<!-- documentation-context -->
> **Dated evidence / release record.** Results and operational details apply to the recorded build, scope and date. They do not establish current deployment health or supersede the public architecture guides. Start with the [documentation index](../README.md) or [current architecture](../ARCHITECTURE_GUIDE.md).
<!-- /documentation-context -->


17 October 2026. Approved scope:
[priority-first UI design](../superpowers/specs/2026-10-17-priority-first-ui-revamp.md).

## What changed

- Green identity, existing fonts and portraits retained. Roster reduced to 248px;
  supporting context to 272px on wide laptops. The selected case gets most space.
- Identity appears once. Contacts have one supporting section; duplicate risk,
  last-response and caregiver summaries were removed from the identity header.
- Case reason and recommendation precede secondary metadata. The coral Update
  case button sits beside the recommendation and opens the existing action form.
  Evidence timeline remains a disclosure; care persistence/conflict logic reused.
- What we know previews three current facts, prioritising personal preferences,
  with actual source and confirmed date. Expired facts are filtered, with the
  preview clock refreshed each minute. Full context uses the existing panel;
  admin management is still restricted. This preview is not semantic retrieval.
- Demo admins get a separate Judge workspace: typed fictional chat, actual reply
  and decision trail. Examples fill the draft without making a request.
- Actual request retrieval is returned only to the existing demo-admin role,
  validated and bounded by the existing memory envelope. The UI shows the
  retrieved content, provenance and confirmation date. It does not substitute
  profile context. Retrieval evidence is response-local; reopening shows recorded
  traces without claiming those traces contain retrieval or save evidence.
- Jev requested/executed/blocked specialists and independent triggers are distinct.
  Actual model, fallback, final policy risk and save/memory-write outcomes are
  visible. Technical values remain expandable; no model reasoning is exposed.
- A failed chat shows an error and warns a save may have occurred. It never
  replaces failure with scripted messages or automatically retries.
- Senior switching clears local run results and withholds older senior traces.
  Failed hydration has a visible retry and allows reselection. Existing account
  generation invalidation still prevents responses from an older session.

## Verification

- Full suite: **160 test files passed, 5 skipped; 1,270 tests passed, 38 skipped**.
- Typecheck, lint and production build passed. Build route list contains no
  temporary preview route. `git diff --check` passed.
- New checks cover scoped/expired preview facts; requested vs executed routing;
  truthful unavailable retrieval/save/fallback displays; validated evidence;
  admin-only response metadata; failed chat without fake replies or retries;
  and senior-switch failure/retry without previous senior evidence.
- Existing account-switch regression tests pass. Independent reviewer identified
  the senior-switch display/recovery issues; fixes and regression were rechecked
  with no remaining blocker in those corrections.
- Browser inspection used a temporary local fixture with fictional records at
  laptop 1366×768 and mobile 390×844. Checked priority/action placement, context
  tab and expansion, separate judge view, and case form open/cancel. No saves,
  model calls or external database requests were made by the fixture. Temporary
  route, generated agent rules and development server were removed/stopped.
- Initial validation caught two obsolete dimension/style assertions, now updated
  for the approved design. Removing the temporary route left stale generated dev
  types; those were cleared, then typecheck/lint/build passed. No runtime defect
  was concealed by changing an assertion.

## Limits and next checkpoint

No production configuration, deployment, migration, promotion or paid provider
call occurred. Public production remains `410b6ef`; the existing Jev candidate
remains `21f4152`. The chat-preference validator fix still needs its final hosted
confirmation. Target-user five-second usability has not been measured.

Batch the UI, Jev and validator fix into one final release candidate. Follow the
existing release runbook for live checks and promotion; do not claim this local
UI is already the public release.

## Owner-requested visual refresh (after the first pass)

The owner found the first pass visually too similar and explicitly requested
nicer fonts, buttons and colours. The current design supersedes the initial
font/palette/geometry choices described above:

- Manrope headings and DM Sans body; font variables moved to html so the root
  theme aliases resolve to the intended fonts. Browser computed style confirms
  Manrope on the selected senior heading.
- White navigation with a green speech mark; sage selected-senior panel, pale
  canvas, white case/context cards and softer borders. Green primary actions,
  quiet bordered secondary buttons; 8px controls and 12–16px panel corners.
- Roster/context columns now 240px/292px. Existing forms, permissions and handlers
  remain unchanged. Updated visual guards allow the approved geometry scale.
- 68 focused tests passed; typecheck, lint and final production build passed.
  Build output excludes the temporary preview route. Initial sandboxed font
  download failed DNS; the network-enabled build succeeded.
- Browser inspection of a fictional local fixture confirmed desktop rendering,
  mobile wrapping without horizontal page overflow and mobile Context navigation.
  Computed font and screenshot were checked. No save/model request was submitted.
  The temporary route, generated rules and local server were removed/stopped.
- Independent review of the visual diff found no actionable regression.
  `git diff --check` passed. No hosted configuration or deployment changed.

Screenshot: `/private/tmp/trustkaki-visual-refresh-2026-10-17.jpg` (local evidence,
not a production screenshot). Target-user usability remains unmeasured.
