import { query, withTransaction } from "./database";
import { CommerceError, commerceStore } from "./commerce-store";

const UUID = /^[a-f0-9-]{36}$/i;
const MAX_GRANT = 100_000;
// 开发 Mock 局不算真实游玩，避免后台统计被调试数据抬高。
const REAL_LIFE = "COALESCE(state::jsonb -> 'flags' ->> 'developerMock', 'false') <> 'true'";
const AGE_NUMBER = "(state::jsonb #>> '{basic,age}') ~ '^[0-9]{1,3}$'";

export interface AdminStats {
  users: number;
  plays: number;
  maxAge: number;
}

export interface AdminUser {
  id: string;
  displayName: string;
  createdAt: number;
  signupRank: number;
  balance: number;
  lives: number;
  maxAge: number;
}

export interface GrantResult {
  scope: "user" | "all";
  amount: number;
  recipients: number;
  balance?: { available: number; held: number };
}

function assertAmount(amount: unknown): asserts amount is number {
  if (!Number.isSafeInteger(amount) || Number(amount) < 1 || Number(amount) > MAX_GRANT) {
    throw new CommerceError("INVALID_AMOUNT", `积分数量需为 1–${MAX_GRANT} 的整数`, 400);
  }
}

function assertKey(key: string): void {
  if (!UUID.test(key)) throw new CommerceError("INVALID_KEY", "请刷新页面后重试", 400);
}

export async function adminStats(): Promise<AdminStats> {
  const [users, lives] = await Promise.all([
    query<{ count: number }>("SELECT count(*)::int AS count FROM identity_users"),
    query<{ plays: number; maxAge: number }>(`
      SELECT count(*)::int AS plays,
        COALESCE(max(CASE WHEN ${AGE_NUMBER} THEN (state::jsonb #>> '{basic,age}')::int END), 0)::int AS "maxAge"
      FROM lives
      WHERE user_id IS NOT NULL AND ${REAL_LIFE}`),
  ]);
  return {
    users: users.rows[0]?.count ?? 0,
    plays: lives.rows[0]?.plays ?? 0,
    maxAge: lives.rows[0]?.maxAge ?? 0,
  };
}

export async function searchUsers(text = ""): Promise<AdminUser[]> {
  const needle = text.trim().slice(0, 80);
  // 首页展示前 100 位（早鸟注册顺序）；搜索时最多返回 50 位，覆盖第 100 位之后。
  const limit = needle ? 50 : 100;
  const { rows } = await query<AdminUser>(`
    WITH ranked AS (
      SELECT user_id, display_name, created_at,
        row_number() OVER (ORDER BY created_at, user_id)::int AS signup_rank
      FROM identity_users
    )
    SELECT r.user_id AS id, r.display_name AS "displayName", r.created_at::float8 AS "createdAt",
      r.signup_rank AS "signupRank",
      COALESCE(a.available, 0)::int AS balance,
      COALESCE(l.lives, 0)::int AS lives,
      COALESCE(l.max_age, 0)::int AS "maxAge"
    FROM ranked r
    LEFT JOIN joy_accounts a ON a.user_id = r.user_id
    LEFT JOIN LATERAL (
      SELECT count(*)::int AS lives,
        max(CASE WHEN (s.state::jsonb #>> '{basic,age}') ~ '^[0-9]{1,3}$'
                 THEN (s.state::jsonb #>> '{basic,age}')::int END) AS max_age
      FROM lives s
      WHERE s.user_id = r.user_id
        AND COALESCE(s.state::jsonb -> 'flags' ->> 'developerMock', 'false') <> 'true'
    ) l ON TRUE
    WHERE $1 = '' OR lower(r.user_id) LIKE lower($1) || '%' OR strpos(lower(r.display_name), lower($1)) > 0
    ORDER BY r.created_at ASC, r.user_id ASC
    LIMIT $2`, [needle, limit]);
  return rows;
}

export async function grantCreditsToUser(userId: string, amount: number, key: string): Promise<GrantResult> {
  assertAmount(amount);
  assertKey(key);
  if (!UUID.test(userId)) throw new CommerceError("USER_NOT_FOUND", "没有找到这个用户", 404);
  return withTransaction(async () => {
    await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`credits:${userId}`]);
    const exists = await query("SELECT 1 FROM identity_users WHERE user_id=$1", [userId]);
    if (!exists.rowCount) throw new CommerceError("USER_NOT_FOUND", "没有找到这个用户", 404);
    await query("INSERT INTO joy_accounts(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
    const added = await query(`INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at)
      VALUES ($1,$2,'admin_grant',$3,$4) ON CONFLICT(reason,reference) DO NOTHING`,
      [userId, amount, `${key}:${userId}`, Date.now()]);
    if (added.rowCount) await query("UPDATE joy_accounts SET available=available+$1 WHERE user_id=$2", [amount, userId]);
    return {
      scope: "user" as const,
      amount,
      recipients: added.rowCount ? 1 : 0,
      balance: await commerceStore.balance(userId),
    };
  });
}

export async function grantCreditsToAll(amount: number, key: string): Promise<GrantResult> {
  assertAmount(amount);
  assertKey(key);
  return withTransaction(async () => {
    // 全体发放串行执行，避免两个批次同时更新大量账户时互相等待行锁。
    await query("SELECT pg_advisory_xact_lock(hashtextextended('admin-grant:all',0))");
    await query("INSERT INTO joy_accounts(user_id) SELECT user_id FROM identity_users ON CONFLICT DO NOTHING");
    const added = await query<{ userId: string }>(`
      INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at)
      SELECT user_id,$1,'admin_grant',$2 || ':' || user_id,$3 FROM identity_users
      ON CONFLICT(reason,reference) DO NOTHING
      RETURNING user_id AS "userId"`, [amount, key, Date.now()]);
    if (added.rowCount) {
      await query("UPDATE joy_accounts SET available=available+$1 WHERE user_id = ANY($2::text[])",
        [amount, added.rows.map((row) => row.userId)]);
    }
    return { scope: "all" as const, amount, recipients: added.rowCount ?? 0 };
  });
}
