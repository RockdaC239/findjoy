import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import path from "node:path";
import type { LifeState } from "./life";

const DEFAULT_DB_FILE = path.join(process.cwd(), ".data", "life.db");

function resolveDbFile(): string {
  const configured = process.env.LIFE_DB_PATH;
  if (configured) return configured;
  if (process.env.NODE_ENV === "test") return ":memory:";
  mkdirSync(path.dirname(DEFAULT_DB_FILE), { recursive: true });
  return DEFAULT_DB_FILE;
}

let db: Database.Database | null = null;

function getDb(): Database.Database {
  if (db) return db;
  db = new Database(resolveDbFile());
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS lives (
      life_id    TEXT PRIMARY KEY,
      state      TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  return db;
}

interface LifeRow { state: string }

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
    getDb()
      .prepare(
        `INSERT INTO lives (life_id, state, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(life_id) DO UPDATE SET state = excluded.state, updated_at = excluded.updated_at`,
      )
      .run(state.lifeId, JSON.stringify(state), new Date().toISOString());
    return state;
  },

  delete(id: string): void {
    getDb().prepare("DELETE FROM lives WHERE life_id = ?").run(id);
  },

  close(): void {
    db?.close();
    db = null;
  },
};
