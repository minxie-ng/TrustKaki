import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

describe("Gate 0 structural regression", () => {
  it("does not accept authoritative browser context on agent routes", () => {
    const schemas = read("src/lib/api/schemas.ts");
    expect(schemas).toContain("seniorId");
    expect(schemas).not.toContain("context: boundedContextSchema");
  });

  it("does not default authenticated persistence to the demo senior", () => {
    const repository = read("src/lib/persistence/trustkakiRepository.ts");
    expect(repository).not.toMatch(/seniorId\s*=\s*DEMO_SENIOR_ID/);
  });

  it("provides one validation command", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.validate).toBeTruthy();
  });
});
