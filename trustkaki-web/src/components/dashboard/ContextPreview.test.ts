import { describe, expect, it } from "vitest";
import type { SeniorContextReadItem } from "@/lib/api/schemas";
import { previewContextItems } from "./ContextPreview";

const fact: SeniorContextReadItem = { id: "one", store: "memory", contextKey: "language", memoryType: "communication_preference", content: "Prefers Mandarin", importance: 4, source: "manual_confirmation", lastConfirmedAt: "2026-10-16T00:00:00Z", updatedAt: "2026-10-16T00:00:00Z", expiresAt: null, safeUseNotes: null, applicationTags: [] };
describe("personal context preview", () => {
  it("never shows another senior’s context during a selection change", () => {
    expect(previewContextItems({ seniorId: "one", items: [fact] }, "two", Date.now())).toEqual([]);
  });
  it("excludes expired facts and caps the preview without mutating source order", () => {
    const items = [{ ...fact, id: "expired", expiresAt: "2026-10-01T00:00:00Z" }, ...[1, 2, 3, 4].map(id => ({ ...fact, id: String(id) }))];
    expect(previewContextItems({ seniorId: "one", items }, "one", Date.parse("2026-10-17T00:00:00Z")).map(item => item.id)).toEqual(["1", "2", "3"]);
    expect(items[0].id).toBe("expired");
  });
});
