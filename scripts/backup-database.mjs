import { Pool } from "pg";
import { mkdir, open, rename, realpath, rm, stat, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { checksum, runPostgresTool, sourceFingerprint, tableSummaries } from "./postgres-backup-tools.mjs";
import { copyOffsite, pruneBackups, sendAlert } from "./backup-maintenance.mjs";
let pool,client,partial,manifestPartial;
const started=Date.now();let stage="configuration";
try {
  const url=process.env.DATABASE_URL,dir=process.env.FINDJOY_BACKUP_DIR;
  if(!url || !dir || !path.isAbsolute(dir))throw new Error("Explicit backup configuration required");
  await mkdir(dir,{recursive:true,mode:0o700});
  const root=await realpath(fileURLToPath(new URL("../",import.meta.url)));
  const relative=path.relative(root,await realpath(dir));
  if(!relative || (!relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)))throw new Error("Backups must be outside source tree");
  if((await stat(dir)).mode&0o077)throw new Error("Backup directory must be private");
  const archive=path.join(dir,`findjoy-${new Date(started).toISOString().replaceAll(":","-")}-${randomUUID()}.dump`);
  partial=archive+".partial";manifestPartial=archive+".json.partial";
  const handle=await open(partial,"wx",0o600);await handle.close();
  pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:3000,statement_timeout:60000,application_name:"findjoy-backup"});
  client=await pool.connect();
  await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  await client.query("SET LOCAL timezone='UTC'");
  await client.query("SELECT version FROM schema_migrations LIMIT 1");
  const snapshot=(await client.query("SELECT pg_export_snapshot() AS id")).rows[0].id;
  stage="dump";
  await runPostgresTool("pg_dump",["--format=custom","--no-owner","--no-acl","--no-password",`--snapshot=${snapshot}`,`--file=${partial}`],url);
  const tables=await tableSummaries(client);
  await client.query("COMMIT");
  stage="archive-verification";
  await runPostgresTool("pg_restore",["--list",partial],url);
  const sha256=await checksum(partial),bytes=(await stat(partial)).size;
  const manifest={version:1,createdAt:new Date(started).toISOString(),completedAt:new Date().toISOString(),source:sourceFingerprint(url),sha256,bytes,tables};
  await writeFile(manifestPartial,JSON.stringify(manifest,null,2)+"\n",{flag:"wx",mode:0o600});
  await rename(partial,archive);partial=undefined;
  await rename(manifestPartial,archive+".json");manifestPartial=undefined;
  // 先复制到异机，再清理本地旧备份；异机失败时保留全部本地副本。
  stage="offsite";
  const offsite=await copyOffsite(archive,archive+".json",process.env);
  stage="retention";
  const removed=await pruneBackups(dir,{
    keepDaily:Number(process.env.FINDJOY_BACKUP_KEEP_DAILY??7),
    keepWeekly:Number(process.env.FINDJOY_BACKUP_KEEP_WEEKLY??4),
  });
  console.log(JSON.stringify({archive,manifest:archive+".json",bytes,durationMs:Date.now()-started,offsite:offsite.configured,removed}));
} catch {
  if(client)await client.query("ROLLBACK").catch(()=>{});
  console.error(`Database backup failed at ${stage}; no credentials or database contents logged`);
  await sendAlert(process.env,{kind:"backup",stage});
  process.exitCode=1;
} finally {
  if(partial)await rm(partial,{force:true}).catch(()=>{});
  if(manifestPartial)await rm(manifestPartial,{force:true}).catch(()=>{});
  client?.release();if(pool)await pool.end();
}
