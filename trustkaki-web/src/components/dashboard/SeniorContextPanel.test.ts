import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  contextPanelEndpoint,
  memoryPanelPresentation,
  reuseContextCommand,
  SeniorContextPanel,
} from "./SeniorContextPanel";

const items = [
  {
    id: "00000000-0000-4000-8000-000000000088",
    store: "memory" as const,
    contextKey: "preferred_language",
    memoryType: "communication_preference" as const,
    content: "Prefers concise Mandarin messages",
    importance: 4,
    safeUseNotes: "Use for message style only.",
    applicationTags: ["concise_text" as const],
    source: "ai_extracted",
    lastConfirmedAt: "2026-07-16T02:00:00.000Z",
    expiresAt: null,
    updatedAt: "2026-07-16T02:00:00.000Z",
  },
];

describe("senior context panel", () => {
  it("shows grouped context to caregivers without management controls", () => {
    const view = memoryPanelPresentation(items, false);

    expect(view).toMatchObject({ visible: true, canManage: false });
    expect(view.groups[0]).toMatchObject({ label: "Preferences" });
    expect(JSON.stringify(view)).not.toMatch(
      /approve|provider response|confidence percentage/i
    );
    const renderedText = renderToStaticMarkup(
      createElement(SeniorContextPanel, {
        context: { seniorId: "senior-1", items },
        loading: false,
        error: null,
        isAdmin: false,
        seniorId: "senior-1",
        authToken: "token",
        onChanged: vi.fn(),
        onUnauthorized: vi.fn(),
      })
    );
    expect(renderedText).toContain("Prefers concise Mandarin messages");
    expect(renderedText).not.toMatch(/approve|provider response|confidence/i);
  });

  it("keeps a command ID only for an identical retry", () => {
    const createId = vi
      .fn()
      .mockReturnValueOnce("command-1")
      .mockReturnValueOnce("command-2");
    const first = reuseContextCommand(null, "same-body", createId);
    const retry = reuseContextCommand(first, "same-body", createId);
    const changed = reuseContextCommand(retry, "changed-body", createId);

    expect(first.id).toBe("command-1");
    expect(retry.id).toBe("command-1");
    expect(changed.id).toBe("command-2");
  });

  it("binds reads and mutations to the selected senior", () => {
    expect(contextPanelEndpoint("senior/2", false)).toBe(
      "/api/seniors/senior%2F2/context"
    );
    expect(contextPanelEndpoint("senior/2", true)).toBe(
      "/api/admin/seniors/senior%2F2/context"
    );
  });
});
