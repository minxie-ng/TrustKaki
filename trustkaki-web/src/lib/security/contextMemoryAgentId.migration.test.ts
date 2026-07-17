import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("Gate 5 Context Memory Agent database identity", () => {
  it("adds the persisted Context Memory Agent ID in a forward migration", () => {
    const migrationsDir = join(process.cwd(), "supabase", "migrations");
    const migrationName = readdirSync(migrationsDir).find((name) =>
      name.endsWith("_gate_5_context_memory_agent_id.sql")
    );

    expect(migrationName).toBeDefined();
    const sql = readFileSync(join(migrationsDir, migrationName!), "utf8").toLowerCase();
    expect(sql).toContain(
      "alter type public.agent_id add value if not exists 'context_memory'"
    );
  });
});
