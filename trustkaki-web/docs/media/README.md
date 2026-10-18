# Documentation media

Two complementary views keep the README readable without hiding implementation details:

- `architecture.html` / `architecture.svg`: eight grouped components covering messaging, configured Telegram check-ins, AI interpretation/policy, multi-day Pattern Watch, staff follow-up, memory, operational storage and outdoor data. Dashed paths mark configured/conditional inputs; channel and scheduler limitations are stated in the figure. Specialist detail remains in [the architecture guide](../ARCHITECTURE.md).
- `memory-lifecycle.html` / `memory-lifecycle.svg`: validated memory writes, scoped retrieval and source revalidation.

HTML files are editable, self-contained diagram sources with inline SVG. SVG exports are embedded in the README; open them separately for presentation. Both use a 1280 × 720 canvas and accessible titles/descriptions.

Designed using [Cathryn Lavery’s diagram-design skill](https://github.com/cathrynlavery/diagram-design), following the existing TrustKaki visual identity: forest green `#164f3e`, sage `#e6f1e8`, paper `#f2f6f3`, white cards and muted green-grey labels. Typography uses Manrope and DM Sans, with system sans-serif fallback if fonts are unavailable. Google Fonts require network access; meaning and layout remain available without them.

Arrows show information flow, not exhaustive scheduling. Limits and failure paths are explained in the accompanying guide to avoid overcrowding the diagrams. The diagram tooling retains its MIT license; application source terms remain in the root README.

Compact Mermaid views in the RAG and agent guides cover retrieval outcomes, memory eligibility and routing authority. These complement the exported overview diagrams rather than adding more detail to the same canvas.

## Repository map and walkthrough video

`generated-repository-map.png` is the unmodified PNG exported from [GitDiagram](https://gitdiagram.com/minxie-ng/trustkaki), generated 17 October 2026 and downloaded 18 October. It is embedded in an expanded-by-default **Explore the codebase** section in the root README, with an interactive link. The export contains the generator's attribution.

The generator reports 26 components and 28 connections, with only three connections supported by its sampled source evidence. Review found that channel adapters call the shared orchestrator directly, not the browser orchestration API, and specialists execute internally rather than through the standalone route used to label their group. These limitations are stated beside the image. It omits details such as authentication, storage internals and parts of the runtime; it is not a complete call graph or deployment-status check. Curated SVG diagrams remain the source-linked explanation of behaviour and boundaries.

The landscape GitDiagram technical walkthrough (**1:24**) is uploaded as a [GitHub video attachment](https://github.com/user-attachments/assets/ab5b9fdf-ebba-4c06-b222-930918af5f81) and embedded near the top of **Explore the project** in the root README. The MP4 is hosted by GitHub and is not committed to Git history. Its generated explanation complements the maintained architecture guide; it does not establish current channel availability, active schedules or unconditional duplicate-processing guarantees.

The product demo remains a separate recording: show the senior message, staff case and decision trail. Once published, link it separately in the README and Devpost rather than merging it with this codebase overview.

## Product screenshots

Five browser captures from the authenticated fictional demo and two user-supplied messaging captures, collected on **18 October 2026 (SGT)**. These PNGs are unmodified captures: captions and callout tables explain the visible evidence without changing the interface or model output. Click images in the [product tour](../DEMO_GUIDE.md) to inspect their original resolution.

| Asset | Capture | Visible evidence |
| --- | --- | --- |
| `care-workspace.png` | 01:47 | Priority queue, follow-up reason, next human action and personal context |
| `four-day-pattern.png` | 01:52 | Cropped timeline of prepared fictional observations across four days |
| `jev-safety-routing.png` | 11:17 | Refreshed interface: payment concern, Triage and Digital Safety result |
| `jev-routing-evidence.png` | 02:04 | Earlier separate run: actual Jev model, digital-safety request and execution |
| `rag-personalisation.png` | 11:18 | Retrieved preferences, source/date and a reply using those facts |
| `telegram-conversation.png` | 10:42 | User-supplied demo chat: breakfast/knee check-in, senior reply and acknowledgement |
| `whatsapp-conversation.png` | 10:42 | User-supplied demo chat: appetite/knee update and a reply mentioning known contacts |

The seven images total about **2.48 MiB**. They are documentation evidence, not application assets or exhaustive test results. The timeline includes prepared fictional history; live-model screenshots show individual observed runs, not guaranteed responses. No credentials are included. Source identifiers in the RAG capture belong to fictional demo records.

The messaging screenshots show displayed exchanges, not evidence of current channel provisioning, recurring scheduler activation or a specific memory-retrieval path. The WhatsApp contact-info screenshot is omitted because it shows configuration rather than the product conversation.
