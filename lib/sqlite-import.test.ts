import { afterEach, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { setupTestPostgres } from "./test-postgres";
import { getPostgresPool } from "./database";
setupTestPostgres();
const directories: string[]=[];
afterEach(async () => { await Promise.all(directories.splice(0).map(dir=>rm(dir,{recursive:true,force:true}))); });
async function fixture() {
  const dir=await mkdtemp(path.join(tmpdir(),"findjoy-import-")); directories.push(dir);
  const file=path.join(dir,"legacy.db");
  const db=new Database(file);
  db.exec(`CREATE TABLE lives(life_id TEXT PRIMARY KEY,state TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE transcripts(life_id TEXT PRIMARY KEY,messages TEXT NOT NULL,updated_at TEXT NOT NULL);
    INSERT INTO lives VALUES ('legacy','{"lifeId":"legacy"}','2026-11-01');
    INSERT INTO transcripts VALUES ('legacy','[]','2026-11-01');`);
  db.close();
  return file;
}
const run=(file:string)=>promisify(execFile)(process.execPath,["scripts/import-sqlite.mjs"],{env:{...process.env,SQLITE_IMPORT_PATH:file,FINDJOY_IMPORT_WRITES_FROZEN:"yes"}});

it("imports old unowned lives without assigning them to a new user and refuses a second import",async()=>{
  const file=await fixture(); await run(file);
  expect((await getPostgresPool().query("SELECT life_id,state,user_id FROM lives")).rows).toEqual([{life_id:"legacy",state:'{"lifeId":"legacy"}',user_id:null}]);
  expect((await getPostgresPool().query("SELECT messages FROM transcripts")).rows).toEqual([{messages:"[]"}]);
  await expect(run(file)).rejects.toThrow();
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM lives")).rows).toEqual([{n:1}]);
});

it.each([false,true])("normalizes legacy credits exactly once while preserving paid amounts and ledger IDs (already points=%s)",async(points)=>{
  const file=await fixture();const db=new Database(file);
  db.exec(`CREATE TABLE joy_accounts(user_id TEXT PRIMARY KEY,available INTEGER NOT NULL,held INTEGER NOT NULL);
    CREATE TABLE joy_ledger(id INTEGER PRIMARY KEY,user_id TEXT,delta INTEGER,reason TEXT,reference TEXT,created_at INTEGER);
    CREATE TABLE joy_migrations(name TEXT PRIMARY KEY);
    CREATE TABLE joy_orders(id TEXT PRIMARY KEY,user_id TEXT,product_id TEXT,name TEXT,credits INTEGER,amount_fen INTEGER,demo INTEGER,channel TEXT,status TEXT,request_id TEXT,created_at INTEGER,idempotency_key TEXT);
    CREATE TABLE identity_users(user_id TEXT PRIMARY KEY,display_name TEXT,created_at INTEGER);
    INSERT INTO identity_users VALUES ('owner','owner',1000);
    ALTER TABLE lives ADD COLUMN user_id TEXT;
    UPDATE lives SET user_id='owner';
    CREATE TABLE joy_life_operations(id TEXT PRIMARY KEY,user_id TEXT,life_id TEXT,idempotency_key TEXT,request_hash TEXT,status TEXT,expires_at INTEGER);
    INSERT INTO joy_life_operations VALUES ('op','owner','legacy','start','hash','pending',9999999999999);
    INSERT INTO joy_accounts VALUES ('owner',1,1);
    INSERT INTO joy_ledger VALUES (17,'owner',2,'purchase','paid',1000);
    INSERT INTO joy_orders VALUES ('paid','owner','old','old',2,1,0,'WECHAT_H5','SUCCEEDED','request',1000,'buy');`);
  if(points)db.exec("INSERT INTO joy_migrations VALUES ('points-v1'); ALTER TABLE joy_life_operations ADD COLUMN cost_points INTEGER DEFAULT 1");
  db.close(); await run(file);
  const factor=points?1:20;
  expect((await getPostgresPool().query("SELECT available,held FROM joy_accounts")).rows).toEqual([{available:factor,held:factor}]);
  expect((await getPostgresPool().query("SELECT credits,amount_fen FROM joy_orders")).rows).toEqual([{credits:2*factor,amount_fen:1}]);
  expect((await getPostgresPool().query("SELECT id::integer,delta FROM joy_ledger")).rows).toEqual([{id:17,delta:2*factor}]);
  const inserted=await getPostgresPool().query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ('owner',0,'test','next',1) RETURNING id::integer");
  expect(inserted.rows[0].id).toBe(18);
});

it("rolls back all imported rows when a source identity link is invalid",async()=>{
  const file=await fixture();const db=new Database(file);
  db.exec("CREATE TABLE identity_users(user_id TEXT PRIMARY KEY,display_name TEXT,created_at INTEGER); INSERT INTO identity_users VALUES ('valid','valid',1); CREATE TABLE identity_links(issuer TEXT,subject TEXT,user_id TEXT); INSERT INTO identity_links VALUES ('issuer','subject','missing')"); db.close();
  await expect(run(file)).rejects.toThrow();
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM identity_users")).rows).toEqual([{n:0}]);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM lives")).rows).toEqual([{n:0}]);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM joy_migrations")).rows).toEqual([{n:0}]);
});

it("rejects unknown source tables and nonempty targets without modifying either",async()=>{
  const file=await fixture();const db=new Database(file);db.exec("CREATE TABLE forgotten_data(secret TEXT)");db.close();
  await expect(run(file)).rejects.toThrow();
  const fixed=new Database(file);fixed.exec("DROP TABLE forgotten_data");fixed.close();
  await getPostgresPool().query("INSERT INTO joy_accounts(user_id,available) VALUES ('existing',99)");
  await expect(run(file)).rejects.toThrow();
  expect((await getPostgresPool().query("SELECT available FROM joy_accounts")).rows).toEqual([{available:99}]);
  const source=new Database(file,{readonly:true});expect(source.prepare("SELECT count(*) AS n FROM lives").get()).toEqual({n:1});source.close();
});

it("refuses an unreconciled source balance and rolls back earlier saves",async()=>{
  const file=await fixture();const db=new Database(file);
  db.exec(`CREATE TABLE identity_users(user_id TEXT PRIMARY KEY,display_name TEXT,created_at INTEGER);
    INSERT INTO identity_users VALUES ('owner','owner',1);
    CREATE TABLE joy_accounts(user_id TEXT PRIMARY KEY,available INTEGER,held INTEGER);
    INSERT INTO joy_accounts VALUES ('owner',1,0)`);db.close();
  await expect(run(file)).rejects.toThrow(/business-invariants/);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM lives")).rows).toEqual([{n:0}]);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS n FROM identity_users")).rows).toEqual([{n:0}]);
});
