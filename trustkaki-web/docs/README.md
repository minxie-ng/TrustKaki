# TrustKaki documentation

TrustKaki helps AAC staff turn everyday senior conversations into prioritised, accountable human follow-up. Personal context, structured specialist reviews and a record of staff actions support a shared care workflow.

## Start here

| Document | What it explains |
| --- | --- |
| [Project overview](../../README.md) | Problem, product, demo access and architecture |
| [Business case](BUSINESS_CASE.md) | Singapore context, users, value hypotheses and pilot measures |
| [Judge guide](JUDGE_GUIDE.md) | No-login walkthrough and authenticated live review |
| [System architecture](ARCHITECTURE_GUIDE.md) | Message-to-care data flow and authority boundaries |
| [Personal-memory RAG](PERSONAL_MEMORY_RAG_GUIDE.md) | Evidence-backed storage, retrieval, correction and failure handling |
| [Agent and tool design](AGENT_SYSTEM.md) | Role responsibilities, structured routing and safeguards |
| [Validation](VALIDATION.md) | Selected bounded evidence, observed failures and limits |
| [Project status](TrustKaki_BUILD_ROADMAP.md) | Implemented capabilities and next-stage work |

[Interactive repository map · GitDiagram](https://gitdiagram.com/minxie-ng/trustkaki) complements the maintained architecture guide. It is an external code-navigation view, not evidence that a workflow is enabled or validated.

![TrustKaki architecture](media/architecture.svg)

## Engineering references

- [Developer setup](../README.md): dependencies, configuration and offline checks.
- [Neon memory operations](NEON_MEMORY_SETUP.md): restricted runtime identity, migrations and indexing.
- [Script catalogue](../scripts/README.md): evaluation, provisioning and verification tools; live commands are opt-in.
- [Release runbook](operations/HACKATHON_RELEASE_RUNBOOK.md): controlled release and rollback procedures.
- [Memory recovery and retention](operations/PERSONAL_MEMORY_RECOVERY_RETENTION.md): recovery boundaries and remaining prerequisites.
- [Diagram assets](media/README.md): editable HTML and SVG exports.
- [Fictional assets](../public/seniors/README.md): demo portrait usage.

Product guides describe current behaviour; dated evidence records retain their original scope. Earlier versions remain in Git history.
