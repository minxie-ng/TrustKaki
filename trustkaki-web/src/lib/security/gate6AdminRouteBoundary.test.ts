import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const productionAdminRoutes = [
  "src/app/api/admin/contact-methods/[methodId]/consent/route.ts",
  "src/app/api/admin/contact-methods/[methodId]/route.ts",
  "src/app/api/admin/contacts/[contactId]/methods/route.ts",
  "src/app/api/admin/contacts/[contactId]/route.ts",
  "src/app/api/admin/seniors/[seniorId]/check-in-schedule/route.ts",
  "src/app/api/admin/seniors/[seniorId]/contacts/route.ts",
  "src/app/api/admin/seniors/[seniorId]/context/route.ts",
  "src/app/api/admin/seniors/[seniorId]/recipient-preview/route.ts",
];

describe("Gate 6 production admin route boundary", () => {
  it.each(productionAdminRoutes)(
    "uses organisation administration in %s",
    (path) => {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain("requireOrganisationAdmin");
      expect(source).not.toContain("requireDemoAdmin");
    }
  );

  it("keeps demo and simulator routes on demo authority", () => {
    for (const path of [
      "src/app/api/demo/reset/route.ts",
      "src/app/api/demo/pattern-watch/route.ts",
      "src/app/api/demo/pattern-watch/quick/route.ts",
      "src/app/api/telegram/dev/simulate/route.ts",
      "src/app/api/whatsapp/dev/simulate/route.ts",
    ]) {
      const source = readFileSync(resolve(process.cwd(), path), "utf8");
      expect(source).toContain("requireDemoAdmin");
      expect(source).not.toContain("requireOrganisationAdmin");
    }
  });
});
