import { createHash } from "node:crypto";
import { query } from "./database";

export async function takeRateLimit(subject: string,action: string,limit: number,windowMs: number,now=Date.now()): Promise<boolean> {
  if (!Number.isSafeInteger(limit) || limit<1 || !Number.isSafeInteger(windowMs) || windowMs<1) throw new Error("限流参数无效");
  const key=createHash("sha256").update(`${action}:${subject}`).digest("hex");
  const result=await query(`INSERT INTO joy_rate_limits VALUES ($1,1,$2) ON CONFLICT(key) DO UPDATE SET
    count=CASE WHEN joy_rate_limits.expires_at<=$3 THEN 1 ELSE joy_rate_limits.count+1 END,
    expires_at=CASE WHEN joy_rate_limits.expires_at<=$3 THEN excluded.expires_at ELSE joy_rate_limits.expires_at END
    WHERE joy_rate_limits.expires_at<=$3 OR joy_rate_limits.count<$4`, [key,now+windowMs,now,limit]);
  return result.rowCount===1;
}
