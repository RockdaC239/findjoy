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

export async function closePostgres(): Promise<void> {
  const pool = databaseGlobal.findjoyPostgres;
  delete databaseGlobal.findjoyPostgres;
  if (pool) await pool.end();
}
