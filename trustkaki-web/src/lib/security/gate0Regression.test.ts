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

  it("keeps TrustKaki persistence behind a small compatibility facade", () => {
    const facade = read("src/lib/persistence/trustkakiRepository.ts");
    expect(facade.split("\n").length).toBeLessThan(100);
    expect(facade).not.toContain(".from(");
    expect(facade).toContain("export {");
  });

  it("keeps the dashboard coordinator small and delegates bounded workflows", () => {
    const dashboard = read("src/components/Dashboard.tsx");
    expect(dashboard.split("\n").length).toBeLessThan(350);
    expect(read("src/components/dashboard/CaseUpdateForm.tsx")).toContain(
      "Save update"
    );
    expect(read("src/components/dashboard/CaseDetails.tsx")).toContain(
      "Chronological evidence timeline"
    );
  });

  it("provides one validation command", () => {
    const pkg = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
    expect(pkg.scripts.validate).toBeTruthy();
  });
});
