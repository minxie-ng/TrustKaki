import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { planLegacyBackfill,importLegacyGroups,stableMemoryDigest } from "../src/lib/memory/legacyBackfill";
import type { Database } from "../src/lib/supabase/types";
import { parseEnv } from "node:util";
import { readFile,chmod } from "node:fs/promises";
import assert from "node:assert/strict";

async function main() {
 const apply = process.argv.includes("--apply");
 const rehearsal = process.argv.includes("--rehearsal");
 if (!process.argv.includes("--confirm-live") || (apply && !rehearsal && !process.argv.includes("--confirm-legacy-frozen"))) throw new Error("Explicit migration confirmation required");
 const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false}});
 async function snapshot() {
  const result = await service.from("senior_memories").select("*",{count:"exact"}).order("id").limit(1001);
  if (result.error || !result.data || result.data.length > 1000 || result.count !== result.data.length) throw new Error("Bounded legacy snapshot unavailable");
  const rows = result.data as Database["public"]["Tables"]["senior_memories"]["Row"][];
  const seniorIds = [...new Set(rows.map(r=>r.senior_id))];
  const seniors = seniorIds.length ? await service.from("seniors").select("id,organisation_id").in("id",seniorIds) : {data:[],error:null};
  const messageIds = rows.map(r=>r.source_message_id).filter((id):id is string=>!!id);
  const messages = messageIds.length ? await service.from("messages").select("id,senior_id,sender,text").in("id",messageIds) : {data:[],error:null};
  if (seniors.error || messages.error) throw new Error("Trusted migration scope unavailable");
  // Rehearse the exact reviewed classification before its audited Supabase migration runs.
  const reviewedRows = rehearsal ? rows.map(r=>r.context_key==='seed:memory:family_context:00000000-0000-4000-8000-000000000321' && r.memory_type==='family_context' && r.source==='caregiver_confirmed'
    ? {...r,application_tags:[...new Set([...r.application_tags,'trusted_contact_route' as const])]} : r) : rows;
  return {plan:planLegacyBackfill(reviewedRows,seniors.data??[],messages.data??[]),rawDigest:stableMemoryDigest(rows)};
 }
 const first = await snapshot();
 const plan = first.plan;
 if (!apply) { console.log(JSON.stringify({dryRun:true,personalRows:plan.personalRowCount,canonicalRecords:plan.groups.length,historyRevisions:plan.groups.reduce((n,g)=>n+g.history.length,0),operationalRows:plan.operationalCount,missingEvidence:plan.groups.filter(g=>g.source.metadata?.provenanceStatus==='missing_source').length,snapshotDigest:plan.digest})); return; }
 let connection = process.env.DATABASE_URL_UNPOOLED!;
 const fileArg = process.argv.find(a=>a.startsWith('--connection-file='));
 if (fileArg) { const path=fileArg.slice('--connection-file='.length); await chmod(path,0o600); connection=parseEnv(await readFile(path,'utf8')).DATABASE_URL_UNPOOLED!; }
 const url = new URL(connection);
 if (url.protocol!=='postgresql:' || !url.hostname.endsWith('.neon.tech') || url.hostname.includes('-pooler') || !['require','verify-full'].includes(url.searchParams.get('sslmode')??'')
  || [...url.searchParams.keys()].some(k=>!['sslmode','channel_binding'].includes(k) || url.searchParams.getAll(k).length!==1)) throw new Error('Direct Neon TLS required');
 if (rehearsal && url.hostname===new URL(process.env.DATABASE_URL_UNPOOLED!).hostname) throw new Error('Rehearsal requires separate branch');
 url.searchParams.set('sslmode','verify-full');
 const db=new Client({connectionString:url.href,connectionTimeoutMillis:10000,query_timeout:30000});
 try {
  await db.connect(); await db.query('BEGIN');
  const query = async (sql:string,values:unknown[]) => (await db.query(sql,values)).rows;
  const result = await importLegacyGroups(query,plan.groups,process.env.TRUSTKAKI_MEMORY_EMBEDDING_MODEL!);
  for (const g of plan.groups) {
   const s=g.source; const args=[s.organisationId,s.seniorId,s.id];
   const current=await db.query('SELECT source,embedding IS NULL AS unindexed FROM personal_memory.records WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND id=$3',args);
   assert.equal(current.rows.length,1); assert.equal(stableMemoryDigest(current.rows[0].source),stableMemoryDigest(s));
   assert.equal(current.rows[0].unindexed,true);
   const revisions=await db.query('SELECT snapshot FROM personal_memory.revisions WHERE organisation_id=$1::uuid AND senior_id=$2::uuid AND id=$3 ORDER BY version',args);
   assert.equal(stableMemoryDigest(revisions.rows.map(r=>r.snapshot)),stableMemoryDigest(g.history));
  }
  const last=await snapshot(); assert.equal(last.rawDigest,first.rawDigest,'Legacy changed during import');
  assert.equal(last.plan.digest,plan.digest);
  assert.equal(stableMemoryDigest(last.plan.groups),stableMemoryDigest(plan.groups),"Evidence changed during import");
  await db.query('COMMIT');
  console.log(JSON.stringify({passed:true,rehearsal,...result,personalRows:plan.personalRowCount,canonicalRecords:plan.groups.length,historyRevisions:plan.groups.reduce((n,g)=>n+g.history.length,0),operationalRows:plan.operationalCount,sourceAndHistoryReconciled:true,legacySnapshotUnchanged:true,snapshotDigest:plan.digest}));
 } catch(error) { await db.query('ROLLBACK').catch(()=>{}); throw error; }
 finally { await db.end(); }
}
main().catch(()=>{console.error('Legacy memory backfill failed; transaction rolled back, credentials and source content omitted');process.exitCode=1;});
