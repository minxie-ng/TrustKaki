# Mobile And Keyboard QA

Date: 31 July 2026

Target: `https://trustkaki.vercel.app/`

Release: `f478b3cf991b`

## Result

PASS. The credential-free judge path was verified at a 390x844 viewport with
keyboard activation through all four demo steps.

- Entry page rendered with no framework overlay, browser errors, horizontal
  overflow, or missing interactive controls.
- Tab order reached Explore demo, email, password, and live-system sign-in in
  the expected order.
- Explore demo was entered with keyboard activation.
- Prepare history, Review priority case, Record human response, and Resolve and
  verify were each activated with Enter.
- Step 2 expanded the evidence timeline inline.
- Step 4 cleared the active case and displayed retained caregiver history.
- The entry page and demo start screen both passed automated WCAG 2 A/AA audit
  with zero violations and zero incomplete checks after release `f478b3c`.
- The automated audit originally identified 4.26:1 coral contrast on the
  reviewer label and primary buttons. The release darkened the shared coral
  token to `#c04e40`, measured at 4.77:1 against white, and added a regression
  test.
- Full repository validation passed: 800 tests, type-check, lint, and
  production build.

## Evidence

- `docs/evidence/2026-07-31-mobile-entry.png`
- `docs/evidence/2026-07-31-mobile-demo-start.png`
- `docs/evidence/2026-07-31-mobile-demo-complete.png`
