import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const root = process.cwd();

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function filesUnder(directory: string): string[] {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(relative) : [relative];
  });
}

function hasUseClientDirective(contents: string): boolean {
  const file = ts.createSourceFile(
    "client.tsx",
    contents,
    ts.ScriptTarget.Latest,
    false,
    ts.ScriptKind.TSX
  );

  for (const statement of file.statements) {
    if (
      !ts.isExpressionStatement(statement) ||
      !ts.isStringLiteral(statement.expression)
    ) {
      return false;
    }
    if (statement.expression.text === "use client") return true;
  }

  return false;
}

const apiRouteFiles = filesUnder("src/app/api")
  .filter((file) => file.endsWith("/route.ts"))
  .sort();

describe("deployment hardening", () => {
  it.each([
    ['"use client";\nexport {};', true],
    ["'use client'\nexport {};", true],
    ['/* license */\n"use client";\nexport {};', true],
    ['"use strict";\n"use client";\nexport {};', true],
    ['"use client".toString();\nexport {};', false],
    ['const marker = "use client";\nexport {};', false],
  ])("classifies use-client directive prologues", (contents, expected) => {
    expect(hasUseClientDirective(contents)).toBe(expected);
  });

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
    const clientFiles = filesUnder("src")
      .filter((file) => /\.tsx?$/.test(file))
      .filter((file) => hasUseClientDirective(source(file)))
      .sort();
    const forbidden = [
      "SUPABASE_SERVICE_ROLE_KEY",
      "TRUSTKAKI_LLM_API_KEY",
      "WHATSAPP_ACCESS_TOKEN",
      "WHATSAPP_VERIFY_TOKEN",
      "META_APP_SECRET",
      "WHATSAPP_INTERNAL_PROCESSOR_SECRET",
      "TELEGRAM_BOT_TOKEN",
      "TELEGRAM_WEBHOOK_SECRET",
      "TELEGRAM_INTERNAL_PROCESSOR_SECRET",
      "CRON_SECRET",
    ];

    for (const file of clientFiles) {
      const contents = source(file);
      for (const key of forbidden) {
        expect(contents, `${file} must not reference ${key}`).not.toContain(key);
      }
    }
  });

  it("uses a Hobby-compatible Supabase cadence for Telegram recovery and deadlines", () => {
    const config = JSON.parse(source("vercel.json")) as {
      crons?: Array<{ path: string; schedule: string }>;
    };
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"));
    const scheduler = migrations.find((name) =>
      name.endsWith("_gate_4_supabase_scheduler.sql")
    );
    expect(scheduler).toBeTruthy();
    const sql = source(`supabase/migrations/${scheduler}`);

    expect(config.crons ?? []).toEqual([]);
    expect(sql).toContain("cron.schedule");
    expect(sql).toContain("*/5 * * * *");
    expect(sql).toContain("/api/internal/check-ins/process-due");
    expect(sql).toContain("trustkaki_cron_secret");
    expect(sql).toContain("trustkaki_base_url");
  });

  it("keeps the scheduler networking extension out of the public schema", () => {
    const migrations = readdirSync(join(process.cwd(), "supabase/migrations"));
    const remediation = migrations.find((name) =>
      name.endsWith("_gate_4_scheduler_extension_schema.sql")
    );

    expect(remediation).toBeTruthy();
    expect(source(`supabase/migrations/${remediation}`)).toContain(
      "create extension pg_net with schema extensions"
    );
  });
});
