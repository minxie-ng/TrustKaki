# TrustKaki

### Everyday conversations. Clearer human care.

TrustKaki helps Active Ageing Centre (AAC) staff turn senior check-ins into prioritised, context-rich follow-ups. It brings together conversation signals, personal memory and a record of what caregivers did next.

**AI Lodge Hackathon · Solving a Business Problem**

[Open TrustKaki](https://trustkaki.vercel.app) · [Judge guide](trustkaki-web/docs/JUDGE_GUIDE.md) · [Technical setup](trustkaki-web/README.md) · [Architecture explained](trustkaki-web/docs/ARCHITECTURE_GUIDE.md) · [Documentation](trustkaki-web/docs/README.md)

## Why this matters in Singapore

Singapore's citizen population aged 65 and above reached **21.4% in 2026**. One-person households among people aged 65 and above increased from **42,100 in 2014 to 87,200 in 2024**. These are demographic indicators, not counts of seniors who need assistance. Sources: [National Population and Talent Division](https://www.population.gov.sg/our-population/population-trends/longevity/), [Ministry of Health](https://www.moh.gov.sg/newsroom/addressing-loneliness-and-psychological-distress-among-seniors-living-alone/).

Care demand is growing alongside workforce expansion: MOH projects the healthcare workforce to grow from **129,000 in 2024 to about 156,000 in 2030**, while describing current staffing as broadly adequate. TrustKaki targets the coordination burden on care teams; it does not assume that AI can replace caregivers. [MOH workforce outlook](https://www.moh.gov.sg/newsroom/current-healthcare-workforce-strength-compared-against-projected-service-demand/).

### The operational problem

AAC staff support many seniors across everyday conversations. A change in appetite, mobility, social contact or digital safety can be easy to miss when messages are scattered and follow-up responsibility is unclear. A message also means more when compared with that person's routine and earlier context.

**TrustKaki turns conversations into a shared, prioritised care workflow:** who needs attention, what changed, and the next human action. Staff can record an outcome, resolve a follow-up and retain its history.

| For the care organisation | Product mechanism | Outcome to validate in a pilot |
| --- | --- | --- |
| Reduce manual review effort | Structured signals and a focused priority queue | Time spent reviewing each case |
| Preserve personal context across staff handovers | Evidence-backed memory with correction history | Staff-reported context usefulness and factual accuracy |
| Make follow-up accountable | Recorded actions, status and retained history | Time to human response and unresolved follow-ups |

These are intended benefits, not measured savings or clinical outcomes. [Business case and pilot measures](trustkaki-web/docs/BUSINESS_CASE.md).

## Try it

| Experience | Access | What happens |
| --- | --- | --- |
| **Explore demo** | No login | Guided fictional care workflow; state stays in your browser. No live model calls or care-record writes. |
| **Judge workspace** | Sign in as `demo@trustkaki.com` | Live AI conversation with a selected fictional senior, plus the recorded decision trail. Use the password supplied privately through Devpost. |
| **Care workspace / Care setup** | Authenticated | Prioritised follow-ups, relevant context, care history and authorised staff controls. |

No registration or extra judge accounts are needed. Use fictional messages only. The shared judge account saves demo results, so its history may include other reviewers' tests. Never put credentials or real senior information in a public submission.

### A three-minute review

1. Open **Explore demo** and follow the guided steps to see a care case through to resolution.
2. Sign in, choose **Judge workspace**, and select a fictional senior.
3. Send a message such as “I feel lonely, but I don't want to join a group activity.” Read the reply and expand its decision trail.
4. Try “Please remember that I prefer quiet one-to-one conversations.” Inspect the **save outcome**; a generated acknowledgement alone does not prove persistence.
5. Ask a related question later and inspect **personal memory retrieved**. Retrieval is selective; every stored fact will not appear on every turn.

See the [judge guide](trustkaki-web/docs/JUDGE_GUIDE.md) for outdoor-advice examples and responsible adversarial tests.

## How the system works

![TrustKaki architecture: messages, Triage, Jev, conditional specialists, personal memory, policy and human care](trustkaki-web/docs/media/architecture.svg)

| Component | Responsibility |
| --- | --- |
| Triage | Interpret the message, extract structured care signals and draft a conversational reply. |
| Jev via OpenRouter | Request relevant specialists through structured routing decisions. Independent safety/context triggers and code exclusions still apply. |
| Conditional specialists | Review digital safety, personal context and community engagement where relevant; prepare caregiver briefings. |
| Outdoor conditions tool | Fetch weather and regional air-quality information from data.gov.sg/NEA when outdoor context calls for it. It is a tool, not another LLM agent. |
| Deterministic policy | Validate outputs and enforce final safety rules. A model cannot override policy. |
| Care team | Review priority, reason and recommended action; record the actual human response. |

The selected reply returns to the conversation. Operational results and follow-up history support the staff dashboard. The diagram groups conditional roles for readability; the [architecture guide](trustkaki-web/docs/ARCHITECTURE_GUIDE.md) expands their responsibilities and boundaries.

## Personal memory with RAG

![Personal-memory lifecycle: evidence validation, Neon source records, embeddings, scoped retrieval and source revalidation](trustkaki-web/docs/media/memory-lifecycle.svg)

**RAG is the retrieval method; Neon is the personal-memory database.** The app saves selected durable facts with evidence rather than treating every message as permanent personal memory.

- **Neon Postgres + pgvector:** personal facts, versions, evidence references, lifecycle and vector search in one database.
- **Pinecone inference:** creates embeddings using `llama-text-embed-v2` (1,024 dimensions). The current path does not use the historical Pinecone vector index.
- **Supabase:** authentication, access relationships, conversation messages and operational care records. Essential care/accessibility and verified contact routing remain operational data.
- **Recent conversation:** supplied separately from long-term retrieval, so ordinary follow-up messages can refer to the current conversation.

Retrieval searches only the authorised organisation/senior scope, considers up to **20 candidates**, then re-reads current sources. It excludes expired, deleted, superseded, conflicting or stale-version facts. At most **six facts** enter a **4,000-character JSON envelope**, with a **two-second retrieval deadline**. Empty and unavailable results are distinct; neither proves that the person has no stored memories.

Changing the chat model does not require moving the memory database. Changing the embedding model requires compatible dimensions and reindexing; vectors from different models are not interchangeable.

[Detailed RAG implementation](trustkaki-web/docs/PERSONAL_MEMORY_RAG_GUIDE.md) · [Presentation notes and failure paths](trustkaki-web/docs/ARCHITECTURE_GUIDE.md)

## Safety and practical limits

- Authentication and scoped access separate staff permissions; demo controls require the appropriate role.
- Typed schemas validate model outputs. Retrieved facts are marked as **untrusted evidence, not instructions**.
- Source/version checks prevent the vector index alone from authorising stale facts. Evidence validation and persistence receipts distinguish proposed memory from accepted writes.
- Human care decisions remain with staff. TrustKaki does not diagnose, prescribe or replace emergency services.
- Weather/air-quality data have timestamps and geographic limits. Regional readings are not street-level measurements or guarantees about future conditions.
- Models can misunderstand language, routing can fail, and prompt-injection defences are not a guarantee. This is a working hackathon prototype, not a clinically validated care service.
- Messaging adapters exist; final WhatsApp delivery remains dependent on external business verification. The authenticated browser demo is the recommended judging path.

## Run locally

```bash
cd trustkaki-web
npm ci
cp .env.example .env.local
npm run dev
```

The no-login walkthrough can be explored without live service credentials. For authenticated AI and memory, configure the services described in the [technical README](trustkaki-web/README.md). Keep `.env.local` out of Git.

```bash
npm run validate
```

This runs tests, type checking, lint and a production build. Paid model evaluations and live database fixture checks are separate, opt-in procedures; ordinary unit tests do not prove live response quality.

## Repository map

| Location | Contents |
| --- | --- |
| [`trustkaki-web/src`](trustkaki-web/src/) | Next.js UI, API routes, agents, policy, memory and persistence |
| [`trustkaki-web/supabase`](trustkaki-web/supabase/) | Operational database migrations and fictional seed data |
| [`trustkaki-web/docs/media`](trustkaki-web/docs/media/) | Editable diagram sources and README exports |
| [`Judge guide`](trustkaki-web/docs/JUDGE_GUIDE.md) | Access, review steps and expected boundaries |
| [`Architecture guide`](trustkaki-web/docs/ARCHITECTURE_GUIDE.md) | Judge-facing technical explanation and source links |
| [`Validation`](trustkaki-web/docs/VALIDATION.md) · [`Operations`](trustkaki-web/docs/operations/) | Selected bounded evaluation evidence and controlled operational procedures |

## Source use

No open-source license is granted. The source is public for hackathon review and portfolio transparency; all rights are reserved by Ng Min Xie. Third-party dependencies and diagram tooling retain their respective licenses.
