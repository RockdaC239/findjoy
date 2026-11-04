import { randomUUID } from "node:crypto";
import { query, withTransaction } from "./database";
import { CommerceError } from "./commerce-store";
import { takeRateLimit } from "./rate-limit";

export interface GenerationAdmissionOptions {
  /** 调试账号可跳过每分钟生成次数限制；全局并发/单用户并发仍生效。 */
  skipRateLimit?: boolean;
}

export async function acquireGeneration(userId: string,now=Date.now(),options: GenerationAdmissionOptions={}): Promise<string> {
  const enabled=process.env.FINDJOY_GENERATION_ENABLED ?? "true";
  const max=Number(process.env.FINDJOY_GENERATION_MAX_CONCURRENT ?? 4);
  if (enabled!=="true" || !Number.isInteger(max) || max<1 || max>20) {
    throw new CommerceError("GENERATION_BUSY","故事生成暂时繁忙，请稍后重试",503);
  }
  return withTransaction(async () => {
    await query("SELECT pg_advisory_xact_lock(1927681102)");
    await query("DELETE FROM joy_generation_admissions WHERE expires_at<=$1", [now]);
    const counts=(await query("SELECT count(*)::integer AS total,count(*) FILTER (WHERE user_id=$1)::integer AS own FROM joy_generation_admissions", [userId])).rows[0];
    if (counts.own) throw new CommerceError("USER_GENERATION_BUSY","你已有故事正在生成，请稍后恢复进度",429);
    if (counts.total>=max) throw new CommerceError("GENERATION_BUSY","体验人数较多，请稍后重试",503);
    if (!options.skipRateLimit && !await takeRateLimit(userId,"generation",20,60000,now)) throw new CommerceError("GENERATION_RATE_LIMIT","操作频繁，请稍后重试",429);
    const token=randomUUID();
    // 模型最多 3 次、每次 60 秒；10 分钟租约留出保存余量，超期提交另行拒绝。
    await query("INSERT INTO joy_generation_admissions VALUES ($1,$2,$3)", [token,userId,now+600000]);
    return token;
  });
}

export async function commitGeneration<T>(token: string,work:()=>Promise<T>,now=Date.now()): Promise<T> {
  return withTransaction(async () => {
    const valid=await query("SELECT token FROM joy_generation_admissions WHERE token=$1 AND expires_at>$2 FOR UPDATE", [token,now]);
    if (!valid.rowCount) throw new CommerceError("GENERATION_EXPIRED","生成已过期，请恢复最新进度");
    return work();
  });
}

export async function releaseGeneration(token: string): Promise<void> {
  try { await query("DELETE FROM joy_generation_admissions WHERE token=$1", [token]); }
  catch { console.error("[generation] capacity release failed; lease expiry will recover it"); }
}
