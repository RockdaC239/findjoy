import { identityStore, type IdentityUser } from "./identity-store";
import { query, withTransaction } from "./database";
import { CommerceError, commerceStore } from "./commerce-store";
import { readDeveloperMode } from "./developer-mode";

export async function isDeveloper(user: Pick<IdentityUser, "id"> | null): Promise<boolean> {
  if (!user) return false;
  // phone 仅由已验证的 OIDC 手机号写入，不接受前端传入的号码或昵称。
  const phone = await identityStore.getPhone(user.id);
  return typeof phone === "string" && /^(?:\+86|0086)?15200297440$/.test(phone.trim());
}

// 开发能力 = 指定账号 + 调试模式开关同时成立；只看账号身份会让测试套餐在正常使用中露出。
export async function hasDeveloperAccess(user: Pick<IdentityUser, "id"> | null, cookieHeader: string | null): Promise<boolean> {
  if (!user) return false;
  if (!readDeveloperMode(cookieHeader).enabled) return false;
  return isDeveloper(user);
}

export async function grantDeveloperCredits(userId: string, key: string) {
  if (!/^[a-f0-9-]{36}$/i.test(key)) throw new CommerceError("INVALID_KEY", "请刷新页面后重试", 400);
  return withTransaction(async () => {
    await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`credits:${userId}`]);
    await query("INSERT INTO joy_accounts(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
    const result = await query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ($1,1000,'developer_grant',$2,$3) ON CONFLICT(reason,reference) DO NOTHING", [userId, `${userId}:${key}`, Date.now()]);
    if (result.rowCount) await query("UPDATE joy_accounts SET available=available+1000 WHERE user_id=$1", [userId]);
    return commerceStore.balance(userId);
  });
}
