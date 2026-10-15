# Capability reply correction

15 October 2026, Singapore. Runtime candidate `2a70f29`; production unchanged.
The specific unsupported-memory-promise blocker from the previous comparison is
resolved on the bounded paths below. Ready for candidate release approval, not
production promotion or real-senior validation.

## What changed

- Requested memory extraction now selects a server-owned neutral acknowledgement:
  `Thank you for telling me.` / `谢谢您告诉我。` The save result is unknown until
  persistence finishes, so the reply never claims or promises a save. This also
  applies when extraction fails or returns no candidates. Actual accepted,
  rejected, duplicate and failed counts remain in existing persistence metadata.
- Recognised contact/relay and font-size requests receive fixed capability wording.
  No extra LLM call, dependency, agent, migration or public response field.
- Urgent health guidance and Digital Safety warnings keep priority. Moderate
  health/daily-living concerns retain a caregiver follow-up suggestion. Briefing
  receives the actual selected reply; deterministic selection is tagged
  `capability_bound_reply` in the policy trace.
- Persistence payloads, bindings, source candidates and channel retry envelopes
  retain their existing contracts. Replies are not rewritten after persistence,
  avoiding disagreement between saved channel retries and delivered text.

## Verification

Test-first regressions forced model drafts to claim saves, remember preferences,
relay messages and change font size. Added empty/failed extraction, mixed-care,
safety-priority and recall-preservation cases. Initial run: eight new regressions
failed; after implementation and reviewed corrections, 103 orchestrator tests pass.

Independent review found ordinary conversation was intercepted by the contact
matcher. Negative fixtures now preserve jokes, stories and `Call Me John` in
English/Mandarin. A live fixture also named someone absent from the fictional
profile; a separate failing regression reproduced this. Bounded capitalised-name
recognition fixed it. Final independent review reported no important findings.

Full `npm run validate` exited 0 on final runtime:

```text
Test Files  144 passed | 5 skipped (149)
Tests       1065 passed | 38 skipped (1103)
typecheck   passed
lint        passed
build       Compiled successfully
```

## Fictional live checks

Same OpenAI snapshot and unchanged fixtures as the previous comparison. Twelve
affected cases ran on `c2747a7`; the unlisted-recipient case was corrected and
retested on `2a70f29`. This is twelve covered scenarios plus one follow-up, not a
fresh full 26-case run on the final revision. Latest observed outcome for each
covered scenario passed developer review:

- Mandarin/English preference and routine statements: neutral acknowledgement,
  current-message memory candidates retained, no promise to remember or save.
- Font request: explicit inability to change display settings.
- Relay request: explicit inability to call or pass messages, including a recipient
  outside the fictional profile. No claim of contacting anyone.
- Refusal: no renewed invitation.
- OTP threat and combined chest pain/OTP: safety guidance preserved, one reply,
  scam concern retained in the briefing, final policy risk preserved.
- Newer toast fact and injected-memory fixture: grounded toast answer, no new
  memory proposal. Unavailable memory: uncertainty, no invented preference.
- Current porridge update: neutral acknowledgement and replacement proposal with
  exact current-message evidence.

All twelve latest outputs had exactly one reply and no fallbacks. Selected replies
and caregiver/AAC briefings were inspected; structured checks also verified reply
count, fallback status, policy/briefing risk and no proposals from recall questions.
[Versioned fictional outputs and usage](data/2026-10-15-capability-replies.json).

This chunk: 22 provider requests, estimated US$0.0057312. Entire comparison ledger:
220 requests, estimated **US$0.0495783**, conservative reservation **US$0.373275**,
within the owner-approved US$1 total. The original ledger was preserved; no fresh
budget was created. Estimates use the previously checked standard token prices,
not a separately reconciled provider invoice. No database access or senior delivery
occurred in these direct orchestration checks.

## Limits and next checkpoint

Intent recognition covers explicit English/Mandarin requests, known contacts,
relatives and capitalised English recipient hints. Unknown lowercase names and
unusual paraphrases may be missed; capitalisation is a hint, not identity proof.
Draft script only chooses language, never authorises an action. Neutral memory
acknowledgements sacrifice conversational detail for truthful capability wording.
This does not establish general hallucination or prompt-injection resistance.

Real Neon persistence, channel delivery and browser interactions were not exercised
by this chunk; their earlier evidence remains separate. Production is unchanged.
Next: exact candidate deployment and signed-in checks under the release runbook's
separate approvals, followed by promotion only after those gates pass.
