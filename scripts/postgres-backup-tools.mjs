import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const run=promisify(execFile);
export const quote=value=>`"${value.replaceAll('"','""')}"`;
export function postgresEnvironment(connectionString) {
  const url=new URL(connectionString);
  const database=decodeURIComponent(url.pathname.slice(1));
  if (!["postgres:","postgresql:"].includes(url.protocol) || !url.hostname || !url.username || !/^[a-zA-Z0-9_-]+$/.test(database)) throw new Error("Unsupported PostgreSQL URI");
  const env={...process.env,PGHOST:url.hostname.replace(/^\[|\]$/g,""),PGPORT:url.port||"5432",
    PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGDATABASE:database,
    PGCONNECT_TIMEOUT:"3",PGAPPNAME:"findjoy-backup-tool",PGOPTIONS:""};
  const parameters={sslmode:"PGSSLMODE",sslrootcert:"PGSSLROOTCERT",sslcert:"PGSSLCERT",sslkey:"PGSSLKEY",options:"PGOPTIONS",connect_timeout:"PGCONNECT_TIMEOUT",application_name:"PGAPPNAME"};
  for (const [key,value] of url.searchParams) {
    if (!parameters[key]) throw new Error("Unsupported connection option");
    env[parameters[key]]=value;
  }
  return env;
}
export function sourceFingerprint(connectionString) {
  const env=postgresEnvironment(connectionString);
  return createHash("sha256").update(JSON.stringify([env.PGHOST,env.PGPORT,env.PGDATABASE])).digest("hex");
}
export async function runPostgresTool(tool,args,connectionString) {
  const directory=process.env.FINDJOY_PG_BIN;
  if (directory && !path.isAbsolute(directory)) throw new Error("FINDJOY_PG_BIN must be absolute");
  const result=await run(directory ? path.join(directory,tool) : tool,args,{
    env:postgresEnvironment(connectionString),timeout:600000,maxBuffer:1024*1024,
  });
  if(result.stderr.trim())throw new Error("PostgreSQL tool produced warnings");
}
export async function checksum(file) {
  const hash=createHash("sha256");
  for await(const chunk of createReadStream(file))hash.update(chunk);
  return hash.digest("hex");
}
export async function tableSummaries(client) {
  const tables=(await client.query("SELECT schemaname,tablename FROM pg_tables WHERE schemaname NOT IN ('pg_catalog','information_schema') ORDER BY schemaname,tablename")).rows;
  const result=[];
  for(const table of tables) {
    const full=`${quote(table.schemaname)}.${quote(table.tablename)}`;
    const summary=(await client.query(`SELECT count(*)::text AS count,
      COALESCE(sum(('x'||substr(md5(row_to_json(t)::text),1,16))::bit(64)::bigint),0)::text AS first,
      COALESCE(sum(('x'||substr(md5(row_to_json(t)::text),17,16))::bit(64)::bigint),0)::text AS second FROM ${full} t`)).rows[0];
    result.push({schema:table.schemaname,table:table.tablename,...summary});
  }
  return result;
}
