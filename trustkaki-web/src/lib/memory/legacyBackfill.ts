import { createHash } from "node:crypto";
import type { Database } from "@/lib/supabase/types";
import { classifyMemoryPurpose, mapLegacyPersonalMemory } from "./personalMemoryMapping";
import { memoryScopeSchema, type MemorySourceRecord } from "./retrievalContracts";
type Row = Database["public"]["Tables"]["senior_memories"]["Row"];
export interface LegacyImportGroup { source: MemorySourceRecord; history: MemorySourceRecord[]; commandId: string; digest: string }
export function stableMemoryDigest(value: unknown): string {
  function canonical(v: unknown): unknown {
    if (Array.isArray(v)) return v.map(canonical);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).sort(([a],[b]) => a.localeCompare(b)).map(([k,x]) => [k,canonical(x)]));
    return v;
  }
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export function planLegacyBackfill(rows: Row[], seniors: { id: string; organisation_id: string }[],
  messages: { id: string; senior_id: string; sender: string; text: string }[]) {
  const groups = new Map<string, Row[]>(); let operationalCount = 0;
  if (new Set(rows.map(r => r.id)).size !== rows.length) throw new Error("Duplicate legacy row");
  for (const row of rows) {
    const purpose = classifyMemoryPurpose(row);
    if (purpose === "operational") { operationalCount++; continue; }
    if (purpose !== "personal") throw new Error("Memory purpose requires review");
    const key = `${row.senior_id}:${row.context_key}`;
    groups.set(key, [...(groups.get(key) ?? []),row]);
  }
  const planned: LegacyImportGroup[] = [];
  for (const [,items] of [...groups.entries()].sort(([a],[b]) => a.localeCompare(b))) {
    const senior = seniors.find(s => s.id === items[0].senior_id);
    if (!senior) throw new Error("Senior scope unavailable");
    const scope = memoryScopeSchema.parse({ organisationId: senior.organisation_id, seniorId: senior.id });
    const incoming = new Set(items.map(r => r.superseded_by_id).filter(Boolean));
    const roots = items.filter(r => !incoming.has(r.id));
    if (roots.length !== 1) throw new Error("Ambiguous memory lineage");
    const ordered: Row[] = []; let current: Row | undefined = roots[0];
    while (current) {
      if (ordered.some(r => r.id === current!.id)) throw new Error("Cyclic memory lineage");
      ordered.push(current);
      if (!current.superseded_by_id) break;
      if (current.status !== "superseded") throw new Error("Invalid memory predecessor");
      current = items.find(r => r.id === current!.superseded_by_id);
      if (!current) throw new Error("Missing memory successor");
    }
    if (ordered.length !== items.length) throw new Error("Disconnected memory lineage");
    const sources = ordered.map((row,index) => {
      const message = messages.find(m => m.id === row.source_message_id && m.senior_id === row.senior_id && m.sender === "senior");
      const evidence = message?.text.includes(row.content) ? { messageId: message.id, text: message.text, excerpt: row.content } : undefined;
      return { ...mapLegacyPersonalMemory({ scope,row,evidence }), version: index + 1 };
    });
    const source = sources.at(-1)!;
    const digest = stableMemoryDigest({ scope, rows: ordered, sources });
    const hex = stableMemoryDigest({ migration: "neon_personal_memory_v1", scope, key: source.contextKey });
    const commandId = `${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`;
    planned.push({ source, history: sources.slice(0,-1), commandId, digest });
  }
  return { groups: planned, operationalCount, personalRowCount: rows.length-operationalCount,
    digest: stableMemoryDigest([...rows].sort((a,b) => a.id.localeCompare(b.id))) };
}

// Caller owns one transaction spanning the complete snapshot and final source reconciliation.
export async function importLegacyGroups(query: (sql: string,values: unknown[]) => Promise<unknown[]>, groups: LegacyImportGroup[],model: string) {
  if (!model.trim() || model.length > 160) throw new Error("Embedding model required");
  let imported = 0; let replayed = 0;
  for (const group of groups) {
    const s = group.source; const scope = [s.organisationId,s.seniorId];
    await query("SELECT pg_advisory_xact_lock(hashtextextended($1 || $2,0))",scope);
    const receipts = await query("SELECT digest FROM personal_memory.commands WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND command_id=$3::uuid",[...scope,group.commandId]) as {digest:string}[];
    if (receipts.length) {
      if (receipts[0].digest !== group.digest) throw new Error("Legacy snapshot changed after import");
      replayed++; continue;
    }
    await query(`INSERT INTO personal_memory.records(organisation_id,senior_id,id,context_key,version,status,source,embedding_model,updated_at)
      VALUES($1::uuid,$2::uuid,$3,$4,$5,$6,$7::jsonb,$8,$9::timestamptz)`,
      [...scope,s.id,s.contextKey,s.version,s.status,JSON.stringify(s),model,s.metadata!.updatedAt]);
    for (const snapshot of group.history) {
      await query(`INSERT INTO personal_memory.revisions(organisation_id,senior_id,id,version,snapshot,actor,reason,command_id,created_at)
        VALUES($1::uuid,$2::uuid,$3,$4,$5::jsonb,'legacy_migration','Preserved original legacy row and lineage',$6::uuid,$7::timestamptz)`,
        [...scope,s.id,snapshot.version,JSON.stringify(snapshot),group.commandId,snapshot.metadata!.updatedAt]);
    }
    await query("INSERT INTO personal_memory.commands(organisation_id,senior_id,command_id,digest,result) VALUES($1::uuid,$2::uuid,$3::uuid,$4,$5::jsonb)",
      [...scope,group.commandId,group.digest,JSON.stringify({id:s.id,version:s.version,status:s.status})]);
    imported++;
  }
  return {imported,replayed};
}
