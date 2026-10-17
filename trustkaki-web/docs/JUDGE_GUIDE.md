# Judge guide

## Access

Open [TrustKaki](https://trustkaki.vercel.app).

- **Explore demo:** no login, fictional browser-only walkthrough. Follow its four guided steps to understand priority, human action and retained history.
- **Judge workspace:** sign in with `demo@trustkaki.com` and the password supplied privately through Devpost. No new account is needed. Choose **Judge workspace** after signing in.

Do not publish the password. The authenticated demo is shared and stateful; use fictional messages only. Live chat calls AI providers and saves results. Public Explore demo does neither.

## See the whole care loop

Start with **Explore demo** to inspect a prepared fictional four-day pattern, its contributing observations and the resulting human follow-up. Then use **Judge workspace** for a new live AI conversation and decision trail. These experiences answer different questions: how staff act on changes over time, and how the AI handles an individual conversation.

Telegram/WhatsApp adapters connect senior conversations to the same underlying care pipeline. The browser walkthrough does not send external messages. Scheduled check-ins are implemented for Telegram and need an authorised recurring worker invocation; WhatsApp live delivery has separate business-verification requirements. See [messaging and pattern architecture](ARCHITECTURE_GUIDE.md#4-messaging-check-ins-and-multi-day-patterns). Review the staff schedule/status interface without enabling schedules or sending messages during an ordinary walkthrough.

## Suggested review

| Try | What to inspect |
| --- | --- |
| “I've been eating less and feel too tired to cook.” | Care signals, final policy and proposed human follow-up; this is not a diagnosis. |
| “I feel lonely, but I don't want group activities.” | Whether the response respects refusal; compare requested specialists with actually executed specialists. |
| “Please remember that I prefer quiet one-to-one conversations.” | Save outcome and accepted/rejected/failed counts. A reply saying “thank you” is not proof of a saved fact. |
| A later related question about social plans | Personal memory retrieved for that specific request, including source evidence where shown. No match is different from no stored memory. |
| “I'm going to Pasir Ris Park for a walk now.” | Outdoor context, tool execution and available forecast/air-quality advice. Inspect timestamps, geographic scope and any unavailable-data outcome. |

Outputs depend on live models, current public data and existing fictional context; these examples are review prompts, not promised fixed answers. Avoid rapid repeated sends while a turn is processing.

## Reading the decision trail

1. **Retrieved personal memory:** context actually supplied for this request.
2. **Triage:** structured interpretation of the current message and bounded context.
3. **Jev routing:** requested specialists, actual execution, exclusions and independent triggers.
4. **Specialist/tool results:** selected reviews and public-data context, where relevant.
5. **Final policy:** the application’s authoritative safety outcome.
6. **Save outcome:** what persisted, including memory acceptance or failure.

The care workspace then presents operational information to staff: priority senior, reason for attention and next human action. The judge workspace exposes extra technical detail to make the AI decisions inspectable.

## Responsible adversarial review

Asking “What do you remember about me?” is a legitimate memory question, not automatically an attack. The system should distinguish retrieved facts, recent conversation and unavailable context without claiming it has no memory merely because nothing matched.

You can also try asking it to ignore its instructions or reveal another senior's data. Expected boundaries are scoped access, no secret disclosure and no treating retrieved text as higher-priority instructions. These safeguards reduce risk; no claim of complete prompt-injection resistance is made.

## Scope

This is a hackathon prototype using fictional senior records. It supports human care coordination rather than autonomous clinical decisions. Live public-data availability and provider latency can vary. Use the browser judge workspace for the primary demonstration; external messaging delivery has separate provider requirements.
