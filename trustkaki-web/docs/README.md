# TrustKaki documentation

TrustKaki is an AI-assisted care coordination prototype for Active Ageing Centre staff. It combines senior conversations, evidence-backed personal memory and conditional specialist reviews to support accountable human follow-up.

## Product and architecture

| Document | Purpose |
| --- | --- |
| [Project overview](../../README.md) | Business problem, capabilities, access and limitations |
| [Judge guide](JUDGE_GUIDE.md) | Public walkthrough and authenticated live review |
| [System architecture](ARCHITECTURE_GUIDE.md) | Agent responsibilities, tool boundaries and data flow |
| [Personal-memory RAG](PERSONAL_MEMORY_RAG_GUIDE.md) | Evidence, semantic retrieval, corrections and failure handling |
| [Agent and tool design](AGENT_SYSTEM.md) | Model responsibilities and deterministic safeguards |
| [Project status](TrustKaki_BUILD_ROADMAP.md) | Implemented capabilities, limitations and next-stage work |

![TrustKaki message-to-care architecture](media/architecture.svg)

## Engineering and operations

- [Developer setup](../README.md): dependencies, environment configuration and verification.
- [Neon memory operations](NEON_MEMORY_SETUP.md): runtime identity, migrations, indexing and rollback boundaries.
- [Release runbook](operations/HACKATHON_RELEASE_RUNBOOK.md): authorised deployment and rollback procedures.
- [Memory recovery and retention](operations/PERSONAL_MEMORY_RECOVERY_RETENTION.md): scoped recovery, erasure and retention requirements.
- [Diagram sources](media/README.md): editable HTML and SVG exports.

## Evidence and project history

Dated documents are records of specific experiments, plans and releases. They may describe superseded designs, failed attempts or an earlier deployment. Their historical results do not establish current deployment health or universal model reliability.

| Collection | Interpretation |
| --- | --- |
| [Evidence](evidence/) | Bounded results, observed failures and stated limitations |
| [Design specifications](superpowers/specs/) | Design rationale and constraints at the recorded date |
| [Implementation plans](superpowers/plans/) | Historical execution plans; not instructions for visitors |
| [Verification](superpowers/verification/) · [Audits](audits/) | Checks against the recorded build and environment |
| [Agent evaluations](agents/) | Experimental protocols and model comparisons |
| [Operational records](operations/) | Release/check procedures and dated executions |
| [Earlier project closeout](PROJECT_CLOSEOUT.md) | Archived release history; not the current submission overview |

Current public guides explain the implemented system. Historical records remain available for traceability rather than being rewritten as claims about the latest build.
