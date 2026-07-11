import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Supabase browser client", () => {
  it("does not reference the service-role secret in the client module", () => {
    const source = readFileSync(join(process.cwd(), "src/lib/supabase/browser.ts"), "utf8");

    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("serviceRoleKey");
    expect(source).not.toContain("service_role");
  });
});
