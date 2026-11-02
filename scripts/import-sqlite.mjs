import Database from "better-sqlite3";
import { Pool } from "pg";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const tables = ["identity_users","identity_links","identity_sessions","identity_login_transactions",
  "lives","transcripts","joy_accounts","joy_ledger","joy_orders","joy_order_checks",
  "joy_payment_attempts","joy_payment_events","joy_life_operations","joy_generation_locks",
  "joy_endings","joy_rate_limits","joy_migrations"];
const optionalColumns = new Set(["lives.user_id","identity_users.phone","identity_users.custom_name","joy_life_operations.cost_points"]);
const quote = value => `"${value.replaceAll('"','""')}"`;
const normalized = value => value === null ? null : String(value);
const digestRow = (hash, values) => hash.update(JSON.stringify(values.map(normalized))+"\n");
let source, client, pool;
let stage="configuration";
try {
  const file=process.env.SQLITE_IMPORT_PATH;
  if (!process.env.DATABASE_URL || !file || !path.isAbsolute(file) || process.env.FINDJOY_IMPORT_WRITES_FROZEN!=="yes") throw new Error("Explicit frozen-source configuration required");
  source=new Database(file,{readonly:true,fileMustExist:true});
  source.defaultSafeIntegers(true);
  source.exec("BEGIN");
  if (source.pragma("quick_check",{simple:true})!=="ok") throw new Error("Source consistency failed");
  const names=source.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all().map(row=>row.name);
  if (!names.includes("lives") || !names.includes("transcripts") || names.some(name=>!tables.includes(name))) throw new Error("Unknown source schema");
  const points=names.includes("joy_migrations") && Boolean(source.prepare("SELECT name FROM joy_migrations WHERE name='points-v1'").get());
  pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:3000,
    statement_timeout:60000,idle_in_transaction_session_timeout:60000,application_name:"findjoy-import"});
  client=await pool.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout='3s'");
  await client.query("SELECT pg_advisory_xact_lock(1927681101)");
  stage="migration-history";
  const directory=new URL("../migrations/",import.meta.url);
  const files=(await readdir(directory)).filter(file=>/^\d+_[a-z0-9_]+\.sql$/.test(file)).sort();
  const history=(await client.query("SELECT version,checksum FROM schema_migrations")).rows;
  if (!files.length || history.length!==files.length) throw new Error("Migrations required");
  for (const file of files) {
    const checksum=createHash("sha256").update(await readFile(new URL(file,directory))).digest("hex");
    if (!history.some(row=>row.version===file && row.checksum===checksum)) throw new Error("Migration mismatch");
  }
  await client.query(`LOCK TABLE ${tables.map(quote).join(",")} IN EXCLUSIVE MODE`);
  for (const table of tables) {
    stage=`empty-target:${table}`;
    if ((await client.query(`SELECT 1 FROM ${quote(table)} LIMIT 1`)).rowCount) throw new Error("Target must be empty");
  }
  const counts={};
  for (const table of tables.filter(table=>names.includes(table))) {
    stage=`import:${table}`;
    const columns=source.pragma(`table_info(${quote(table)})`).map(row=>row.name);
    const target=(await client.query("SELECT column_name,is_nullable,column_default,is_identity,data_type FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=$1 ORDER BY ordinal_position",[table])).rows;
    if (columns.some(column=>!target.some(row=>row.column_name===column))) throw new Error("Unknown source column");
    if (target.some(row=>!columns.includes(row.column_name) && !optionalColumns.has(`${table}.${row.column_name}`) && row.is_nullable==='NO' && row.column_default===null && row.is_identity!=='YES')) throw new Error("Missing required column");
    const keys=source.pragma(`table_info(${quote(table)})`).filter(row=>row.pk>0).sort((a,b)=>Number(a.pk)-Number(b.pk)).map(row=>row.name);
    // shortcut: 首发小库逐行导入并在内存校验，规模明显增长时改用流式 COPY。
    const hash=createHash("sha256");let count=0;
    for (const row of source.prepare(`SELECT * FROM ${quote(table)} ORDER BY ${(keys.length ? keys : columns).map(column=>`${quote(column)} COLLATE BINARY`).join(",")}`).iterate()) {
      for (const column of columns) {
        if (["lives.state","transcripts.messages","identity_login_transactions.payload","joy_endings.ending"].includes(`${table}.${column}`)) JSON.parse(row[column]);
      }
      const values=columns.map(column=> {
        const value=row[column];
        return value !== null && !points && ((table==="joy_accounts" && ["available","held"].includes(column)) || (table==="joy_ledger" && column==="delta") || (table==="joy_orders" && column==="credits")) ? BigInt(value)*20n : value;
      });
      await client.query(`INSERT INTO ${quote(table)}(${columns.map(quote).join(",")}) VALUES (${values.map((_,i)=>`$${i+1}`).join(",")})`, values);
      digestRow(hash,values);count++;
    }
    const actual=createHash("sha256");
    const targetOrder=(keys.length ? keys : columns).map(column=>`${quote(column)}${target.find(row=>row.column_name===column)?.data_type==='text' ? ' COLLATE "C"' : ''} NULLS FIRST`).join(",");
    const rows=(await client.query(`SELECT ${columns.map(quote).join(",")} FROM ${quote(table)} ORDER BY ${targetOrder}`)).rows;
    for(const row of rows)digestRow(actual,columns.map(column=>row[column]));
    if (rows.length!==count || hash.digest("hex")!==actual.digest("hex")) throw new Error("Content verification failed");
    counts[table]=count;
  }
  stage="business-invariants";
  const invalid=await client.query(`SELECT 1 FROM joy_accounts a WHERE
    a.available::bigint+a.held<>COALESCE((SELECT sum(delta) FROM joy_ledger WHERE user_id=a.user_id),0)
    OR a.held<>COALESCE((SELECT sum(cost_points) FROM joy_life_operations WHERE user_id=a.user_id AND status='pending'),0)
    UNION ALL SELECT 1 FROM lives l WHERE l.user_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM identity_users u WHERE u.user_id=l.user_id)
    UNION ALL SELECT 1 FROM transcripts t WHERE NOT EXISTS (SELECT 1 FROM lives l WHERE l.life_id=t.life_id)
    UNION ALL SELECT 1 FROM joy_ledger j WHERE NOT EXISTS (SELECT 1 FROM joy_accounts a WHERE a.user_id=j.user_id)
    UNION ALL SELECT 1 FROM joy_accounts a WHERE NOT EXISTS (SELECT 1 FROM identity_users u WHERE u.user_id=a.user_id)
    UNION ALL SELECT 1 FROM joy_life_operations o WHERE o.status='pending' AND NOT EXISTS (SELECT 1 FROM lives l WHERE l.life_id=o.life_id AND l.user_id=o.user_id)
    UNION ALL SELECT 1 FROM joy_orders o WHERE NOT EXISTS (SELECT 1 FROM identity_users u WHERE u.user_id=o.user_id)
    UNION ALL SELECT 1 FROM joy_payment_events e WHERE NOT EXISTS (SELECT 1 FROM joy_orders o WHERE o.id=e.order_id)
    UNION ALL SELECT 1 FROM joy_payment_attempts a WHERE NOT EXISTS (SELECT 1 FROM joy_orders o WHERE o.id=a.order_id)
    UNION ALL SELECT 1 FROM joy_order_checks c WHERE NOT EXISTS (SELECT 1 FROM joy_orders o WHERE o.id=c.order_id)
    UNION ALL SELECT 1 FROM joy_life_operations o WHERE NOT EXISTS (SELECT 1 FROM joy_accounts a WHERE a.user_id=o.user_id)
    UNION ALL SELECT 1 FROM joy_generation_locks g WHERE NOT EXISTS (SELECT 1 FROM lives l WHERE l.life_id=g.life_id AND l.user_id=g.user_id)
    UNION ALL SELECT 1 FROM joy_endings e WHERE NOT EXISTS (SELECT 1 FROM lives l WHERE l.life_id=e.life_id AND l.user_id=e.user_id)
    LIMIT 1`);
  if (invalid.rowCount) throw new Error("Account or ownership reconciliation failed");
  await client.query("SELECT setval(pg_get_serial_sequence('joy_ledger','id'),COALESCE((SELECT max(id) FROM joy_ledger),1),EXISTS(SELECT 1 FROM joy_ledger))");
  await client.query("INSERT INTO joy_migrations(name) VALUES ('points-v1'),('sqlite-import-v1') ON CONFLICT DO NOTHING");
  await client.query("COMMIT");
  console.log(JSON.stringify({imported:counts,legacyCreditsNormalized:!points,verified:true}));
} catch {
  if(client)await client.query("ROLLBACK").catch(()=>{});
  console.error(`SQLite import refused or rolled back at ${stage}; no data or credentials logged`);
  process.exitCode=1;
} finally {
  source?.close();client?.release();if(pool)await pool.end();
}
