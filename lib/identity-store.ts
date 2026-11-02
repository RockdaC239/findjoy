import { createHash, randomBytes, randomUUID } from "node:crypto";
import { getPostgresPool, withTransaction } from "./database";
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
function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export const identityStore = {
  async beginLogin(pending: LoginTransaction, now = Date.now()): Promise<string> {
    const token = randomBytes(32).toString("base64url");
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM identity_login_transactions WHERE token_hash IN
        (SELECT token_hash FROM identity_login_transactions WHERE expires_at <= $1 LIMIT 100)`, [now]);
      await client.query("INSERT INTO identity_login_transactions VALUES ($1,$2,$3)",
        [tokenHash(token), JSON.stringify(pending), now + 10 * 60 * 1000]);
    });
    return token;
  },

  async consumeLogin(token: string, now = Date.now()): Promise<LoginTransaction | null> {
    if (!token || token.length > 128) return null;
    const { rows } = await getPostgresPool().query(
      "DELETE FROM identity_login_transactions WHERE token_hash=$1 RETURNING payload, expires_at", [tokenHash(token)]);
    const row = rows[0];
    if (!row || Number(row.expires_at) <= now) return null;
    return JSON.parse(row.payload) as LoginTransaction;
  },

  async resolveUser(issuer: string, subject: string, displayName = "探索者", phone: string | null = null): Promise<IdentityUser> {
    if (!issuer || issuer.length > 512 || !subject || subject.length > 512) throw new Error("身份标识无效");
    return withTransaction(async (client) => {
      // 同一外部身份首次并发登录也只生成一个 UUID，不串行阻塞其他身份。
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [JSON.stringify([issuer, subject])]);
      const existing = (await client.query("SELECT user_id FROM identity_links WHERE issuer=$1 AND subject=$2", [issuer, subject])).rows[0];
      const id = existing?.user_id ?? randomUUID();
      const name = displayName.trim().slice(0, 80) || "探索者";
      if (existing) {
        await client.query("UPDATE identity_users SET display_name=CASE WHEN custom_name=1 THEN display_name ELSE $1 END, phone=$2 WHERE user_id=$3", [name, phone, id]);
      } else {
        await client.query("INSERT INTO identity_users(user_id,display_name,created_at,phone) VALUES ($1,$2,$3,$4)", [id, name, Date.now(), phone]);
        await client.query("INSERT INTO identity_links VALUES ($1,$2,$3)", [issuer, subject, id]);
      }
      return (await client.query<IdentityUser>('SELECT user_id AS id, display_name AS "displayName" FROM identity_users WHERE user_id=$1', [id])).rows[0];
    });
  },

  async updateDisplayName(userId: string, displayName: string): Promise<void> {
    if (!validDisplayName(displayName)) throw new Error("昵称需为 1–80 个字符，且不能包含换行或控制字符");
    const result = await getPostgresPool().query("UPDATE identity_users SET display_name=$1,custom_name=1 WHERE user_id=$2", [displayName.trim(), userId]);
    if (result.rowCount !== 1) throw new Error("账户不存在");
  },

  async getPhone(userId: string): Promise<string | null> {
    return (await getPostgresPool().query("SELECT phone FROM identity_users WHERE user_id=$1", [userId])).rows[0]?.phone ?? null;
  },

  async createSession(userId: string, now = Date.now(), lifetime = SESSION_LIFETIME) {
    const token = randomBytes(32).toString("base64url");
    const expiresAt = now + lifetime;
    await withTransaction(async (client) => {
      await client.query(`DELETE FROM identity_sessions WHERE token_hash IN
        (SELECT token_hash FROM identity_sessions WHERE expires_at <= $1 LIMIT 100)`, [now]);
      await client.query("INSERT INTO identity_sessions VALUES ($1,$2,$3)", [tokenHash(token), userId, expiresAt]);
    });
    return { token, expiresAt };
  },

  async getSession(token: string, now = Date.now()): Promise<IdentityUser | null> {
    if (!token || token.length > 128) return null;
    return (await getPostgresPool().query<IdentityUser>(`
      SELECT u.user_id AS id, u.display_name AS "displayName"
      FROM identity_sessions s JOIN identity_users u ON s.user_id=u.user_id
      WHERE s.token_hash=$1 AND s.expires_at>$2`, [tokenHash(token), now])).rows[0] ?? null;
  },

  async revokeSession(token: string): Promise<void> {
    if (!token || token.length > 128) return;
    await getPostgresPool().query("DELETE FROM identity_sessions WHERE token_hash=$1", [tokenHash(token)]);
  },
};
