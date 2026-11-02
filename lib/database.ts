import { AsyncLocalStorage } from "node:async_hooks";
import { Pool, type QueryResultRow, type PoolClient } from "pg";

const transactionClient = new AsyncLocalStorage<PoolClient>();

export function query<T extends QueryResultRow = QueryResultRow>(sql: string, values?: unknown[]) {
  return (transactionClient.getStore() ?? getPostgresPool()).query<T>(sql, values);
}

const databaseGlobal = globalThis as typeof globalThis & { findjoyPostgres?: Pool };

export function getPostgresPool(): Pool {
  if (databaseGlobal.findjoyPostgres) return databaseGlobal.findjoyPostgres;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("必须配置 DATABASE_URL，数据库不可用时不回退临时存储");
  const max = Number(process.env.FINDJOY_DB_POOL_MAX ?? 5);
  if (!Number.isInteger(max) || max < 1 || max > 20) {
    throw new Error("FINDJOY_DB_POOL_MAX 必须为 1–20 的整数");
  }
  const pool = new Pool({
    connectionString,
    max,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
    idle_in_transaction_session_timeout: 10000,
    options: "-c lock_timeout=3000",
    application_name: "findjoy",
  });
  // 空闲连接错误不抛出进程级异常，也不打印可能包含凭据的错误正文。
  pool.on("error", () => console.error("[database] PostgreSQL idle connection failed"));
  databaseGlobal.findjoyPostgres = pool;
  return pool;
}

export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const existing = transactionClient.getStore();
  if (existing) return work(existing);
  const client = await getPostgresPool().connect();
  let destroy = false;
  try {
    await client.query("BEGIN");
    const result = await transactionClient.run(client, () => work(client));
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); }
    catch { destroy = true; }
    throw error;
  } finally {
    client.release(destroy);
  }
}

const unavailableCodes = new Set([
  "ECONNREFUSED", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EPIPE", "ETIMEDOUT",
  "08000", "08001", "08003", "08004", "08006", "08007",
  "28P01", "28000", "3D000", "53300", "53400", "57P01", "57P02", "57P03",
]);

/** 只识别连接、认证、库不存在和容量类错误；业务约束错误仍走各自的状态码。 */
export function isDatabaseUnavailable(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; current && depth < 3; depth += 1) {
    if (typeof current !== "object") return false;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && unavailableCodes.has(code)) return true;
    const message = current instanceof Error ? current.message : "";
    if (/必须配置 DATABASE_URL|FINDJOY_DB_POOL_MAX 必须|timeout exceeded when trying to connect|Connection terminated|connection refused|ECONNREFUSED|ECONNRESET/i.test(message)) return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function closePostgres(): Promise<void> {
  const pool = databaseGlobal.findjoyPostgres;
  delete databaseGlobal.findjoyPostgres;
  if (pool) await pool.end();
}
