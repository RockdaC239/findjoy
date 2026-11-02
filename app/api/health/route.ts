import { createHash } from "node:crypto";
import { readFile,readdir } from "node:fs/promises";
import path from "node:path";
import { query } from "../../../lib/database";

export const dynamic="force-dynamic";
export const runtime="nodejs";
const tables=["identity_users","identity_links","identity_sessions","identity_login_transactions",
  "lives","transcripts","joy_accounts","joy_ledger","joy_orders","joy_order_checks","joy_payment_attempts",
  "joy_payment_events","joy_life_operations","joy_generation_locks","joy_endings","joy_rate_limits",
  "joy_migrations","joy_generation_admissions","joy_payment_review_events"];
let expected:Promise<Array<{version:string;checksum:string}>> | undefined;
function expectedMigrations() {
  return expected ??= (async()=>{
    const directory=path.join(process.cwd(),"migrations");
    const files=(await readdir(directory)).filter(file=>/^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
    if(!files.length)throw new Error("Missing migrations");
    return Promise.all(files.map(async version=>({version,checksum:createHash("sha256").update(await readFile(path.join(directory,version))).digest("hex")})));
  })();
}
export async function GET() {
  const headers={"Cache-Control":"no-store"};
  try {
    const wanted=await expectedMigrations();
    const actual=(await query<{version:string;checksum:string}>("SELECT version,checksum FROM schema_migrations ORDER BY version")).rows;
    if(actual.length!==wanted.length || actual.some((row,i)=>row.version!==wanted[i].version || row.checksum!==wanted[i].checksum))throw new Error("Migration mismatch");
    const access=(await query(`SELECT bool_and(COALESCE(has_table_privilege(
      to_regclass(format('%I.%I',current_schema(),name)),privilege),false)) AS ready
      FROM unnest($1::text[]) AS names(name)
      CROSS JOIN unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) AS needed(privilege)`,[tables])).rows[0];
    if(!access.ready)throw new Error("Runtime access unavailable");
    const sequence=(await query("SELECT has_sequence_privilege(pg_get_serial_sequence('joy_ledger','id'),'USAGE') AS ready")).rows[0];
    if(!sequence.ready)throw new Error("Sequence access unavailable");
    await query(`SELECT l.life_id,l.state,l.user_id,u.display_name,u.phone,u.custom_name,s.token_hash,s.expires_at,
      o.amount_fen,o.credits,o.status,a.available,a.held,g.token FROM lives l,identity_users u,
      identity_sessions s,joy_orders o,joy_accounts a,joy_generation_admissions g LIMIT 0`);
    return Response.json({ready:true},{headers});
  } catch {
    return Response.json({ready:false},{status:503,headers});
  }
}
