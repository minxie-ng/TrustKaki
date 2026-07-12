import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const apiRouteFiles = [
  "src/app/api/agents/aac-nudge/route.ts",
  "src/app/api/agents/briefing/route.ts",
  "src/app/api/agents/digital-safety/route.ts",
  "src/app/api/agents/orchestrate/route.ts",
  "src/app/api/agents/triage/route.ts",
  "src/app/api/caregiver/queue-action/route.ts",
  "src/app/api/dashboard/state/route.ts",
  "src/app/api/demo/pattern-watch/quick/route.ts",
  "src/app/api/demo/pattern-watch/route.ts",
  "src/app/api/demo/reset/route.ts",
  "src/app/api/health/route.ts",
  "src/app/api/internal/whatsapp/process-pending/route.ts",
  "src/app/api/whatsapp/dev/simulate/route.ts",
  "src/app/api/whatsapp/webhook/route.ts",
];

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("deployment hardening", () => {
  it("forces Node.js runtime on all TrustKaki API routes", () => {
    for (const file of apiRouteFiles) {
      expect(source(file), file).toContain('export const runtime = "nodejs";');
      expect(source(file), file).not.toContain('runtime = "edge"');
    }
  });

  it("does not include hardcoded tunnel or localhost URLs in production source", () => {
    const productionFiles = apiRouteFiles.filter(
      (file) => !file.includes("/whatsapp/dev/")
    );
    const combined = productionFiles.map(source).join("\n");

    expect(combined).not.toContain("trycloudflare");
    expect(combined).not.toContain("ngrok");
    expect(combined).not.toContain("localhost:");
    expect(combined).not.toContain("127.0.0.1");
  });

  it("does not reference server-only secrets in client components", () => {
    const clientFiles = [
      "src/app/page.tsx",
      "src/components/AgentTracePanel.tsx",
      "src/components/ChatSimulation.tsx",
      "src/components/Dashboard.tsx",
      "src/components/NavBar.tsx",
    ];
    const forbidden = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "TRUSTKAKI_LLM_API_KEY",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_VERIFY_TOKEN",
      "META_APP_SECRET",
      "WHATSAPP_INTERNAL_PROCESSOR_SECRET",
    ];

    for (const file of clientFiles) {
      const contents = source(file);
      for (const key of forbidden) {
        expect(contents, `${file} must not reference ${key}`).not.toContain(key);
      }
    }
  });
});
