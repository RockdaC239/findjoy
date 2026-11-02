import { afterEach, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { closePostgres, getPostgresPool, withTransaction } from "./database";

afterEach(async () => { await closePostgres(); vi.unstubAllEnvs(); });

it("requires an explicit database URL instead of silently using another store", () => {
  vi.stubEnv("DATABASE_URL", "");
  expect(() => getPostgresPool()).toThrow("DATABASE_URL");
});

it.each(["0", "-1", "1.5", "abc", "1000"])("rejects an invalid connection limit: %s", (value) => {
  vi.stubEnv("DATABASE_URL", "postgresql://localhost/findjoy_test");
  vi.stubEnv("FINDJOY_DB_POOL_MAX", value);
  expect(() => getPostgresPool()).toThrow("FINDJOY_DB_POOL_MAX");
});

describe.skipIf(!process.env.TEST_DATABASE_URL)("real PostgreSQL transactions", () => {
  it("rolls back failed work, commits successful work and releases connections", async () => {
    vi.stubEnv("DATABASE_URL", process.env.TEST_DATABASE_URL!);
    vi.stubEnv("FINDJOY_DB_POOL_MAX", "2");
    const pool = getPostgresPool();
    const table = `test_balance_${randomUUID().replaceAll("-", "")}`;
    await pool.query(`CREATE TABLE ${table}(id integer PRIMARY KEY, balance integer NOT NULL)`);
    try {
      await pool.query(`INSERT INTO ${table} VALUES (1, 100)`);
      await expect(withTransaction(async (client) => {
        await client.query(`UPDATE ${table} SET balance=0 WHERE id=1`);
        await client.query("SELECT 1/0");
      })).rejects.toThrow();
      expect((await pool.query(`SELECT balance FROM ${table}`)).rows).toEqual([{ balance: 100 }]);
      await Promise.all(Array.from({ length: 12 }, () => withTransaction(async (client) => {
        await client.query(`UPDATE ${table} SET balance=balance-1 WHERE id=1`);
      })));
      expect((await pool.query(`SELECT balance FROM ${table}`)).rows).toEqual([{ balance: 88 }]);
      expect(pool.waitingCount).toBe(0);
      expect(pool.idleCount).toBe(pool.totalCount);
      await expect(withTransaction(async (client) => {
        await client.query("SET LOCAL statement_timeout=50");
        await client.query("SELECT pg_sleep(1)");
      })).rejects.toThrow("statement timeout");
      expect((await pool.query("SELECT 1 AS ready")).rows).toEqual([{ ready: 1 }]);
      const held = await Promise.all([pool.connect(), pool.connect()]);
      try {
        await expect(pool.connect()).rejects.toThrow("timeout");
      } finally {
        held.forEach((client) => client.release());
      }
    } finally {
      await pool.query(`DROP TABLE ${table}`);
    }
  });
});
