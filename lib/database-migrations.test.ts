import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Pool } from "pg";

const run = promisify(execFile);
const pools: Pool[] = [];
afterEach(async () => { await Promise.all(pools.splice(0).map((pool) => pool.end())); });

describe.skipIf(!process.env.TEST_DATABASE_URL)("PostgreSQL schema migration command", () => {
  it("serializes repeated migrations, enforces constraints and rejects edited migration history", async () => {
    const admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    pools.push(admin);
    const schema = `migration_test_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL!);
    url.searchParams.set("options", `-c search_path=${schema}`);
    const pool = new Pool({ connectionString: url.toString() });
    pools.push(pool);
    const migrate = () => run(process.execPath, ["scripts/migrate-database.mjs"], {
      env: { ...process.env, DATABASE_URL: url.toString() },
    });
    try {
      await pool.query("CREATE TABLE joy_accounts (existing integer)");
      await expect(migrate()).rejects.toThrow();
      expect((await pool.query("SELECT to_regclass('identity_users') AS name")).rows).toEqual([{ name: null }]);
      expect((await pool.query("SELECT to_regclass('schema_migrations') AS name")).rows).toEqual([{ name: null }]);
      await pool.query("DROP TABLE joy_accounts");
      await Promise.all([migrate(), migrate()]);
      expect((await pool.query("SELECT version FROM schema_migrations")).rows).toEqual([{ version: "001_initial.sql" }]);
      await pool.query("INSERT INTO joy_accounts(user_id,available) VALUES ('owner',100)");
      await migrate();
      expect((await pool.query("SELECT available FROM joy_accounts")).rows).toEqual([{ available: 100 }]);
      await expect(pool.query("UPDATE joy_accounts SET available=-1")).rejects.toThrow();
      await expect(pool.query("INSERT INTO identity_links VALUES ('issuer','subject','missing')")).rejects.toThrow();
      await pool.query("UPDATE schema_migrations SET checksum='changed'");
      await expect(migrate()).rejects.toThrow();
      expect((await pool.query("SELECT available FROM joy_accounts")).rows).toEqual([{ available: 100 }]);
    } finally {
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    }
  });
});
