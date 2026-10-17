# Diagram assets

Two complementary views keep the README readable without hiding implementation details:

- `architecture.html` / `architecture.svg`: eight grouped components covering messaging, configured Telegram check-ins, AI interpretation/policy, multi-day Pattern Watch, staff follow-up, memory, operational storage and outdoor data. Dashed paths mark configured/conditional inputs; channel and scheduler limitations are stated in the figure. Specialist detail remains in [the architecture guide](../ARCHITECTURE_GUIDE.md).
- `memory-lifecycle.html` / `memory-lifecycle.svg`: validated memory writes, scoped retrieval and source revalidation.

HTML files are editable, self-contained diagram sources with inline SVG. SVG exports are embedded in the README; open them separately for presentation. Both use a 1280 × 720 canvas and accessible titles/descriptions.

Designed using [Cathryn Lavery’s diagram-design skill](https://github.com/cathrynlavery/diagram-design), following the existing TrustKaki visual identity: forest green `#164f3e`, sage `#e6f1e8`, paper `#f2f6f3`, white cards and muted green-grey labels. Typography uses Manrope and DM Sans, with system sans-serif fallback if fonts are unavailable. Google Fonts require network access; meaning and layout remain available without them.

Arrows show information flow, not exhaustive scheduling. Limits and failure paths are explained in the accompanying guide to avoid overcrowding the diagrams. The diagram tooling retains its MIT license; application source terms remain in the root README.

Compact Mermaid views in the RAG and agent guides cover retrieval outcomes, memory eligibility and routing authority. These complement the exported overview diagrams rather than adding more detail to the same canvas.

## Repository map and walkthrough video

`generated-repository-map.png` is the unmodified PNG exported from [GitDiagram](https://gitdiagram.com/minxie-ng/trustkaki), generated 17 October 2026 and downloaded 18 October. It is embedded in a collapsed **Explore the codebase** section in the root README, with an interactive link. The export contains the generator's attribution.

The generator reports 26 components and 28 connections, with only three connections supported by its sampled source evidence. Review found that channel adapters call the shared orchestrator directly, not the browser orchestration API, and specialists execute internally rather than through the standalone route used to label their group. These limitations are stated beside the image. It omits details such as authentication, storage internals and parts of the runtime; it is not a complete call graph or deployment-status check. Curated SVG diagrams remain the source-linked explanation of behaviour and boundaries.

For a walkthrough video, place a small linked thumbnail in **Explore the project**, directly before its table, once the video is published. Host the recording externally and use the same video URL in Devpost; keep the full video out of Git to avoid repository bloat. Add a screenshot thumbnail here only when an actual recording exists, and label any prepared fictional sequence clearly. A code-map tour complements a product demonstration but does not replace showing the senior message, staff case and decision trail.
