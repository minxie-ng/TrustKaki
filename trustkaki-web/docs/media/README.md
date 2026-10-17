# Diagram assets

Two complementary views keep the README readable without hiding implementation details:

- `architecture.html` / `architecture.svg`: authenticated message-to-care workflow, with specialist detail in [the architecture guide](../ARCHITECTURE_GUIDE.md).
- `memory-lifecycle.html` / `memory-lifecycle.svg`: validated memory writes, scoped retrieval and source revalidation.

HTML files are editable, self-contained diagram sources with inline SVG. SVG exports are embedded in the README; open them separately for presentation. Both use a 1280 × 720 canvas and accessible titles/descriptions.

Designed using [Cathryn Lavery’s diagram-design skill](https://github.com/cathrynlavery/diagram-design), following the existing TrustKaki visual identity: forest green `#164f3e`, sage `#e6f1e8`, paper `#f2f6f3`, white cards and muted green-grey labels. Typography uses Manrope and DM Sans, with system sans-serif fallback if fonts are unavailable. Google Fonts require network access; meaning and layout remain available without them.

Arrows show information flow, not exhaustive scheduling. Limits and failure paths are explained in the accompanying guide to avoid overcrowding the diagrams. The diagram tooling retains its MIT license; application source terms remain in the root README.
