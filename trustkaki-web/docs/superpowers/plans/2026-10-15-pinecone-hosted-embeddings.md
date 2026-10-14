# Pinecone-hosted embeddings implementation plan

> Execute inline with executing-plans; review before completion.

**Goal:** Support the user's dedicated 1,024-dimensional pilot index with Pinecone
Inference, preserving external-provider support and the isolated fictional scope.

**Architecture:** Recognise only the exact `https://api.pinecone.io/embed` endpoint
as Pinecone Inference. Use existing Pinecone credentials/version header; passage
inputs for ingestion, query inputs for retrieval, no silent truncation. Validate
model, dense vectors, count, finite values, widths and usage. The runner reuses the
Pinecone key only for that exact endpoint. No new dependency or production wiring.

**Files:** `pineconePilot.ts` and transport tests; evaluation runner and CLI tests;
configuration template, guide, roadmap, and evidence. `.env.local` stays ignored.

- [x] Add transport tests for native payload, modes/auth/signal, validation and failures;
  observe failure, then implement the endpoint branch without changing existing HTTP behaviour.
- [x] Test runner configuration before adding native credential reuse.
- [x] Fill verified non-secret local values; preserve user secrets and leave score/budget explicit.
- [x] Run focused tests, TypeScript and lint; review diff independently.
- [x] Record measured checks and remaining live prerequisites; commit.

Live pilot remains conditional on credentials and an explicit provider spending
limit. Do not create credentials, upgrade the account, or upload senior records.
