import { beforeAll, beforeEach, afterAll, vi } from "vitest";
import { Pool } from "pg";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { closePostgres } from "./database";

// 每个测试文件独立 schema，生产连接串不能作为测试连接串隐式回退。
export function setupTestPostgres() {
  const schema = `test_${randomUUID().replaceAll("-", "")}`;
  let admin: Pool;
  let connectionString: string;
  beforeAll(async () => {
    if (!process.env.TEST_DATABASE_URL) throw new Error("PostgreSQL 测试需要独立的 TEST_DATABASE_URL");
    admin = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    await admin.query(`CREATE SCHEMA ${schema}`);
    const url = new URL(process.env.TEST_DATABASE_URL);
    url.searchParams.set("options", `-c search_path=${schema} -c lock_timeout=3000`);
    connectionString = url.toString();
    await promisify(execFile)(process.execPath, ["scripts/migrate-database.mjs"], {
      env: { ...process.env, DATABASE_URL: connectionString },
    });
  });
  beforeEach(async () => {
    await closePostgres();
    vi.stubEnv("DATABASE_URL", connectionString);
    await admin.query(`TRUNCATE ${schema}.identity_users, ${schema}.identity_links,
      ${schema}.identity_sessions, ${schema}.identity_login_transactions`);
  });
  afterAll(async () => {
    await closePostgres();
    if (admin) {
      await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
      await admin.end();
    }
    vi.unstubAllEnvs();
  });
}
