import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { LifeState } from "./life";
import type { TranscriptMessage } from "./model-adapter";

const DEFAULT_DB_FILE = path.join(process.cwd(), ".data", "life.db");

// 每写多少次执行一次 WAL checkpoint（TRUNCATE），防止 WAL 无限增长、降低崩溃恢复成本。
const CHECKPOINT_EVERY_N_WRITES = 50;

function resolveDbFile(): string {
  const configured = process.env.LIFE_DB_PATH;
  if (configured) return configured;
  if (process.env.NODE_ENV === "test") return ":memory:";
  mkdirSync(path.dirname(DEFAULT_DB_FILE), { recursive: true });
  return DEFAULT_DB_FILE;
}

let db: Database.Database | null = null;
let writeCount = 0;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(resolveDbFile());
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.pragma("synchronous = NORMAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS lives (
      life_id    TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS transcripts (
      life_id    TEXT PRIMARY KEY,
      messages   TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
  return db;
}

interface LifeRow { state: string }

function checkpointIfNeeded(): void {
  writeCount += 1;
  if (writeCount >= CHECKPOINT_EVERY_N_WRITES) {
    writeCount = 0;
    try {
      db?.pragma("wal_checkpoint(TRUNCATE)");
    } catch (error) {
      console.error("[life-store] wal_checkpoint failed:", error instanceof Error ? error.message : error);
    }
  }
}

export const lifeStore = {
  get(id: string): LifeState | null {
    const row = getDb().prepare("SELECT state FROM lives WHERE life_id = ?").get(id) as LifeRow | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.state) as LifeState;
    } catch {
      return null;
    }
  },

  set(state: LifeState): LifeState {
    try {
      getDb()
        .prepare(
          `INSERT INTO lives (life_id, state, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(life_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
        )
        .run(state.lifeId, JSON.stringify(state), new Date().toISOString());
      checkpointIfNeeded();
    } catch (error) {
      // 持久化失败绝不静默：打日志并向上抛，避免"以为保存了其实没有"
      console.error(`[life-store] failed to persist life ${state.lifeId.slice(0, 8)}…:`, error instanceof Error ? error.message : error);
      throw error;
    }
    return state;
  },

  listSummaries(): Array<{ lifeId: string; age: number; city: string; events: number; dead: boolean; updatedAt: string }> {
    const rows = getDb().prepare("SELECT life_id, state, updated_at FROM lives ORDER BY updated_at DESC").all() as Array<{ life_id: string; state: string; updated_at: string }>;
    return rows.map((row) => {
      let state: LifeState;
      try {
        state = JSON.parse(row.state) as LifeState;
      } catch {
        return { lifeId: row.life_id, age: 0, city: "", events: 0, dead: false, updatedAt: row.updated_at };
      }
      return {
        lifeId: row.life_id,
        age: state.basic.age,
        city: state.basic.city,
        events: state.history.length,
        dead: state.dead,
        updatedAt: row.updated_at,
      };
    });
  },

  delete(id: string): void {
    getDb().prepare("DELETE FROM lives WHERE life_id = ?").run(id);
    getDb().prepare("DELETE FROM transcripts WHERE life_id = ?").run(id);
  },

  // 对话转录（DeepSeek 前缀缓存）：没有转录行返回 null（旧存档），
  // 新人生从第一轮开始由 start/next 路由逐轮追加写入。
  getTranscript(id: string): TranscriptMessage[] | null {
    const row = getDb().prepare("SELECT messages FROM transcripts WHERE life_id = ?").get(id) as { messages?: string } | undefined;
    if (!row || typeof row.messages !== "string") return null;
    try {
      const parsed: unknown = JSON.parse(row.messages);
      return Array.isArray(parsed) ? (parsed as TranscriptMessage[]) : null;
    } catch {
      return null;
    }
  },

  setTranscript(id: string, messages: TranscriptMessage[]): void {
    try {
      getDb()
        .prepare(
          `INSERT INTO transcripts (life_id, messages, updated_at) VALUES (?, ?, ?)
           ON CONFLICT(life_id) DO UPDATE SET messages = excluded.messages, updated_at = excluded.updated_at`,
        )
        .run(id, JSON.stringify(messages), new Date().toISOString());
      checkpointIfNeeded();
    } catch (error) {
      console.error(`[life-store] failed to persist transcript ${id.slice(0, 8)}…:`, error instanceof Error ? error.message : error);
      throw error;
    }
  },

  close(): void {
    try {
      db?.pragma("wal_checkpoint(TRUNCATE)");
    } catch { /* ignore */ }
    db?.close();
    db = null;
    writeCount = 0;
  },
};
