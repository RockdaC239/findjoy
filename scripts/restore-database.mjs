import { Pool } from "pg";
import { readFile,stat } from "node:fs/promises";
import path from "node:path";
import { checksum,postgresEnvironment,runPostgresTool,sourceFingerprint,tableSummaries } from "./postgres-backup-tools.mjs";
let pool,client;const started=Date.now();let stage="configuration";
try {
  const url=process.env.RESTORE_DATABASE_URL,archive=process.env.FINDJOY_RESTORE_ARCHIVE;
  if(!url || !archive || !path.isAbsolute(archive) || process.env.FINDJOY_RESTORE_EMPTY_TARGET!=="yes")throw new Error("Explicit empty target confirmation required");
  stage="archive-verification";
  const manifest=JSON.parse(await readFile(archive+".json","utf8"));
  if(manifest.version!==1 || !Array.isArray(manifest.tables) || !(await stat(archive)).isFile() || manifest.bytes!==(await stat(archive)).size || manifest.sha256!==await checksum(archive))throw new Error("Invalid archive");
  if(manifest.source===sourceFingerprint(url))throw new Error("Refuse source database restore");
  pool=new Pool({connectionString:url,max:1,connectionTimeoutMillis:3000,statement_timeout:60000,application_name:"findjoy-restore"});
  client=await pool.connect();await client.query("SET timezone='UTC'");
  stage="empty-target";
  const objects=await client.query(`SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND n.nspname NOT LIKE 'pg_toast%'
    UNION ALL SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    UNION ALL SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema')
    UNION ALL SELECT 1 FROM pg_namespace WHERE nspname NOT IN ('pg_catalog','information_schema','public') AND nspname NOT LIKE 'pg_%' LIMIT 1`);
  if(objects.rowCount)throw new Error("Target is not empty");
  stage="restore";
  await runPostgresTool("pg_restore",["--single-transaction","--exit-on-error","--no-owner","--no-acl","--no-password",`--dbname=${postgresEnvironment(url).PGDATABASE}`,archive],url);
  stage="data-verification";
  const actual=await tableSummaries(client);
  if(JSON.stringify(actual)!==JSON.stringify(manifest.tables))throw new Error("Restored data mismatch");
  console.log(JSON.stringify({verified:true,tables:actual.length,durationMs:Date.now()-started}));
} catch {
  console.error(`Database restore refused or failed at ${stage}; target must remain isolated until verified`);
  process.exitCode=1;
} finally {client?.release();if(pool)await pool.end();}
