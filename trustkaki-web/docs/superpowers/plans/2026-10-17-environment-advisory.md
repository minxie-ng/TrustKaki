# Environment advisory implementation plan

Approved scope: chat-triggered government weather and air-quality advice; no new agent, scheduler, notification, storage or provider call.

1. Add a bounded server tool using four fixed data.gov.sg endpoints, Zod response validation, 5-minute shared response cache, timeouts and freshness/validity checks.
2. Resolve a named destination locally from government forecast areas. Use home area only for explicit near-home requests. Ask for area when unknown or ambiguous; never send personal data to government APIs.
3. Use current 2-hour forecast for immediate plans and the next-day 24-hour forecast for tomorrow. Explain that present air readings do not predict tomorrow. Apply NEA's 1-hour PM2.5 vulnerable-person guidance; PSI remains context, not a replacement for PM2.5.
4. Select this bounded reply only after urgent, safety and care gates; activity refusal remains respected. Record actual sources, area, timestamps, coverage and deterministic tool identity in the existing activity trace.
5. Add focused offline fixtures and prepare a production build. Respect the user's request to avoid extended testing; no paid calls, live database writes or deployment without the existing release checkpoint.
