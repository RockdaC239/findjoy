import { randomUUID } from "node:crypto";
import { expect,it } from "vitest";
import { setupTestPostgres } from "./test-postgres";
import { query,closePostgres,withTransaction } from "./database";
import { GET } from "../app/api/health/route";
setupTestPostgres();
it("reports readiness only when database migrations and runtime relations are present",async()=>{
 const response=await GET();expect(response.status).toBe(200);expect(await response.json()).toEqual({ready:true});
 expect(response.headers.get("cache-control")).toContain("no-store");
 await query("ALTER TABLE joy_generation_admissions RENAME TO hidden_admissions");
 try {const broken=await GET();expect(broken.status).toBe(503);expect(await broken.json()).toEqual({ready:false});}
 finally {await query("ALTER TABLE hidden_admissions RENAME TO joy_generation_admissions");}
});
it("refuses a changed migration history without exposing SQL or configuration",async()=>{
 const old=(await query("SELECT version,checksum FROM schema_migrations ORDER BY version LIMIT 1")).rows[0];
 await query("UPDATE schema_migrations SET checksum='changed' WHERE version=$1",[old.version]);
 try {const response=await GET();expect(response.status).toBe(503);expect(await response.text()).toBe('{"ready":false}');}
 finally {await query("UPDATE schema_migrations SET checksum=$1 WHERE version=$2",[old.checksum,old.version]);}
});
it("returns an unavailable response when no database is configured",async()=>{
 const previous=process.env.DATABASE_URL;await closePostgres();process.env.DATABASE_URL="";
 try {const response=await GET();expect(response.status).toBe(503);expect(await response.json()).toEqual({ready:false});}
 finally {process.env.DATABASE_URL=previous;}
});

it("requires runtime write and sequence privileges, not just a working SELECT connection",async()=>{
 const role=`health_${randomUUID().replaceAll("-","")}`;
 const schema=(await query("SELECT current_schema() AS name")).rows[0].name;
 await query(`CREATE ROLE ${role} NOLOGIN`);
 try {
   await query(`GRANT USAGE ON SCHEMA "${schema}" TO ${role}`);
   await query(`GRANT SELECT ON ALL TABLES IN SCHEMA "${schema}" TO ${role}`);
   const denied=await withTransaction(async client=>{await client.query(`SET LOCAL ROLE ${role}`);return GET();});
   expect(denied.status).toBe(503);
   await query(`GRANT INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA "${schema}" TO ${role}`);
   const noSequence=await withTransaction(async client=>{await client.query(`SET LOCAL ROLE ${role}`);return GET();});
   expect(noSequence.status).toBe(503);
   await query(`GRANT USAGE ON ALL SEQUENCES IN SCHEMA "${schema}" TO ${role}`);
   const ready=await withTransaction(async client=>{await client.query(`SET LOCAL ROLE ${role}`);return GET();});
   expect(ready.status).toBe(200);
 } finally {await query(`DROP OWNED BY ${role}`);await query(`DROP ROLE ${role}`);}
});
