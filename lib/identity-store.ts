import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getDb } from "./life-store";
import { validDisplayName } from "./account-profile";

export interface IdentityUser {
  id: string;
  displayName: string;
}

export interface LoginTransaction {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
}

const SESSION_LIFETIME = 30 * 24 * 60 * 60 * 1000;

function database() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS identity_users (
      user_id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS identity_links (
      issuer TEXT NOT NULL,
      subject TEXT NOT NULL,
      user_id TEXT NOT NULL REFERENCES identity_users(user_id),
      PRIMARY KEY (issuer, subject)
    );
    CREATE TABLE IF NOT EXISTS identity_sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES identity_users(user_id),
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS identity_login_transactions (
      token_hash TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS identity_sessions_expiry ON identity_sessions(expires_at);
  `);
  const columns = db.pragma("table_info(identity_users)") as { name: string }[];
  if (!columns.some(column => column.name === "phone")) db.exec("ALTER TABLE identity_users ADD COLUMN phone TEXT");
  if (!columns.some(column => column.name === "custom_name")) db.exec("ALTER TABLE identity_users ADD COLUMN custom_name INTEGER NOT NULL DEFAULT 0");
  return db;
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const identityStore = {
  beginLogin(pending: LoginTransaction, now = Date.now()): string {
    const token = randomBytes(32).toString("base64url");
    const db = database();
    db.transaction(() => {
      db.prepare("DELETE FROM identity_login_transactions WHERE expires_at <= ?").run(now);
      db.prepare("INSERT INTO identity_login_transactions VALUES (?, ?, ?)")
        .run(tokenHash(token), JSON.stringify(pending), now + 10 * 60 * 1000);
    })();
    return token;
  },

  consumeLogin(token: string, now = Date.now()): LoginTransaction | null {
    if (!token || token.length > 128) return null;
    const db = database();
    return db.transaction(() => {
      const row = db.prepare("DELETE FROM identity_login_transactions WHERE token_hash = ? RETURNING payload, expires_at")
        .get(tokenHash(token)) as { payload: string; expires_at: number } | undefined;
      if (!row || row.expires_at <= now) return null;
      return JSON.parse(row.payload) as LoginTransaction;
    }).immediate();
  },

  resolveUser(issuer: string, subject: string, displayName = "探索者", phone: string | null = null): IdentityUser {
    if (!issuer || issuer.length > 512 || !subject || subject.length > 512) {
      throw new Error("身份标识无效");
    }
    const db = database();
    return db.transaction(() => {
      const existing = db.prepare("SELECT user_id FROM identity_links WHERE issuer = ? AND subject = ?")
        .get(issuer, subject) as { user_id: string } | undefined;
      const id = existing?.user_id ?? randomUUID();
      const name = displayName.trim().slice(0, 80) || "探索者";
      if (existing) {
        db.prepare("UPDATE identity_users SET display_name = CASE WHEN custom_name = 1 THEN display_name ELSE ? END, phone = ? WHERE user_id = ?").run(name, phone, id);
      } else {
        db.prepare("INSERT INTO identity_users (user_id, display_name, created_at, phone) VALUES (?, ?, ?, ?)").run(id, name, Date.now(), phone);
        db.prepare("INSERT INTO identity_links VALUES (?, ?, ?)").run(issuer, subject, id);
      }
      return db.prepare("SELECT user_id AS id, display_name AS displayName FROM identity_users WHERE user_id = ?").get(id) as IdentityUser;
    }).immediate();
  },

  updateDisplayName(userId: string, displayName: string): void {
    if (!validDisplayName(displayName)) throw new Error("昵称需为 1–80 个字符，且不能包含换行或控制字符");
    const result = database().prepare("UPDATE identity_users SET display_name = ?, custom_name = 1 WHERE user_id = ?").run(displayName.trim(), userId);
    if (result.changes !== 1) throw new Error("账户不存在");
  },

  getPhone(userId: string): string | null {
    const row = database().prepare("SELECT phone FROM identity_users WHERE user_id = ?").get(userId) as { phone: string | null } | undefined;
    return row?.phone ?? null;
  },

  createSession(userId: string, now = Date.now(), lifetime = SESSION_LIFETIME) {
    const db = database();
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + lifetime;
    db.transaction(() => {
      db.prepare("DELETE FROM identity_sessions WHERE expires_at <= ?").run(now);
      db.prepare("INSERT INTO identity_sessions VALUES (?, ?, ?)").run(tokenHash(token), userId, expiresAt);
    })();
    return { token, expiresAt };
  },

  getSession(token: string, now = Date.now()): IdentityUser | null {
    if (!token || token.length > 128) return null;
    const row = database().prepare(`
      SELECT u.user_id AS id, u.display_name AS displayName
      FROM identity_sessions s JOIN identity_users u ON s.user_id = u.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?
    `).get(tokenHash(token), now) as IdentityUser | undefined;
    return row ?? null;
  },

  revokeSession(token: string): void {
    database().prepare("DELETE FROM identity_sessions WHERE token_hash = ?").run(tokenHash(token));
  },
};
