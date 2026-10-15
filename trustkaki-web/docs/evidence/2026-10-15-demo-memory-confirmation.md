# Fictional demo memory confirmation — 15 October 2026

The project owner explicitly selected “Keep all three as fictional demo facts”
after reviewing the migrated communication and meal-support preferences. This
approval concerns fictional seed context, not evidence about real seniors.

All three were retained without changing their content, through the signed-in
caregiver correction UI on deployed runtime `4a262ac`. Each reason records owner
approval, the date and the fact that it is not evidence about a real senior.
The existing flow records the authenticated actor, increments the source version,
preserves revision history and generates the current embedding.

Read-only Neon assertions passed:

```json
{"confirmed":3,"currentEmbeddings":3,"provenance":"manual_confirmation","auditEntries":3}
```

The UI showed “Context corrected” and today's confirmation date. No operational
care baseline, case, channel, schedule, access rule or legacy Supabase personal
row was changed. The archived canonical record remains archived. No code change
or redeployment was needed for this review.

Next slice: scheduled bounded indexing retries, with authentication, batch/cost
limits, backoff and current-version publication. Existing indexing still retries
on writes and retrieval; no scheduler was enabled in this confirmation slice.
