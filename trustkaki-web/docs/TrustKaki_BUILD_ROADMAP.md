# Project status and roadmap

AI Lodge Hackathon · Solving a Business Problem · Updated 17 October 2026

[Documentation](README.md) · [Business case](BUSINESS_CASE.md) · [Validation](VALIDATION.md)

## Implemented

| Area | Capability | Boundary |
| --- | --- | --- |
| Staff workflow | Prioritised senior case, reason, recommended human action, recorded outcomes and retained history | Human staff remain accountable for care decisions |
| Personal memory | Neon canonical facts, evidence, versions, corrections, archive and pgvector retrieval | Selective memory; no promise of perfect recall or bounded total storage |
| AI orchestration | Triage, active Jev specialist routing, conditional specialists and typed results | Deterministic policy retains final authority |
| Contextual tools | Government weather and regional air-quality data for relevant outdoor plans | Geographic, freshness and timing limits apply |
| Public access | No-login fictional walkthrough | No live model calls or care-record writes |
| Judge access | Authenticated live chat and recorded decision trail | Shared fictional demo state; credentials supplied privately |
| Channel adapters | Telegram and WhatsApp integration code | Final WhatsApp delivery depends on external business verification |

## Submission priorities

- A concise public repository and clear account instructions.
- Devpost explanation centred on staff capacity, meaningful AI and safety boundaries.
- Current screenshots and a short reproducible demonstration.
- Feature work limited to defects that block the submission workflow.

## Before a real AAC pilot

1. Validate staff workflow usefulness with AAC users and establish a meaningful comparison workload.
2. Measure multi-turn conversational faithfulness, missed concerns and false-positive follow-ups across broader language coverage.
3. Complete independent backup, post-restore erasure and retention requirements.
4. Measure memory-query performance on realistic per-senior corpora and assess approximate indexing when justified.
5. Introduce distributed rate limits and operational monitoring for multi-instance use.
6. Verify event sources and permissions before claiming current event availability or any automated outreach.

## Evidence interpretation

[Validation](VALIDATION.md) distinguishes local checks, bounded live experiments, reported failures and unverified outcomes. A prior test count or synthetic benchmark is not evidence of clinical safety, production capacity or general model superiority.
