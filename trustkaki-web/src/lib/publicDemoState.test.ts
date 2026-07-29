import { describe, expect, it } from "vitest";
import {
  applyPublicDemoCommand,
  createInitialPublicDemo,
  PUBLIC_DEMO_STORAGE_KEY,
  PUBLIC_DEMO_TTL_MS,
  restorePublicDemo,
  serializePublicDemo,
} from "./publicDemoState";

const start = new Date("2026-07-29T02:00:00.000Z");

describe("public demo state", () => {
  it("starts with fictional clean data and no external identifiers", () => {
    const document = createInitialPublicDemo(start);
    expect(document.phase).toBe("orientation");
    expect(document.data.followUpQueue).toHaveLength(0);
    expect(document.data.senior.name).toContain("Mr Tan");
    expect(serializePublicDemo(document)).not.toMatch(/phone|telegram|whatsapp|provider|credential/i);
    expect(PUBLIC_DEMO_STORAGE_KEY).not.toContain("localStorage");
  });

  it("prepares, records, and resolves the fictional case idempotently", () => {
    const initial = createInitialPublicDemo(start);
    const prepared = applyPublicDemoCommand(initial, "prepare", start);
    const preparedAgain = applyPublicDemoCommand(prepared, "prepare", start);
    const responded = applyPublicDemoCommand(prepared, "recordResponse", new Date(start.getTime() + 1000));
    const respondedAgain = applyPublicDemoCommand(responded, "recordResponse", new Date(start.getTime() + 2000));
    const resolved = applyPublicDemoCommand(responded, "resolve", new Date(start.getTime() + 3000));

    expect(prepared.data.followUpQueue).toHaveLength(1);
    expect(prepared.data.followUpQueue[0].pattern?.evidence).toHaveLength(4);
    expect(preparedAgain.data.followUpQueue).toHaveLength(1);
    expect(responded.data.followUpQueue[0].status).toBe("acknowledged");
    expect(responded.data.activity).toHaveLength(1);
    expect(respondedAgain.data.activity).toHaveLength(1);
    expect(resolved.data.followUpQueue).toHaveLength(0);
    expect(resolved.data.activity).toHaveLength(2);
  });

  it("restores valid state and rejects expired, malformed, and incompatible state", () => {
    const document = createInitialPublicDemo(start);
    const raw = serializePublicDemo(document);
    expect(restorePublicDemo(raw, new Date(start.getTime() + PUBLIC_DEMO_TTL_MS - 1))).toEqual(document);
    expect(restorePublicDemo(raw, new Date(start.getTime() + PUBLIC_DEMO_TTL_MS))).toBeNull();
    expect(restorePublicDemo("not json", start)).toBeNull();
    expect(restorePublicDemo(JSON.stringify({ ...document, schemaVersion: 99 }), start)).toBeNull();
  });

  it("resets expired commands to a clean document", () => {
    const document = createInitialPublicDemo(start);
    const expired = applyPublicDemoCommand(document, "prepare", new Date(start.getTime() + PUBLIC_DEMO_TTL_MS));
    expect(expired.phase).toBe("orientation");
    expect(expired.data.followUpQueue).toHaveLength(0);
  });
});
