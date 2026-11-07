import { identityStore } from "./identity-store";
import { EARLY_SIGNUP_LIMIT, EARLY_SIGNUP_POINTS, SIGNUP_POINTS } from "./points";

export function configuredTrialCredits(): number {
  return Number(process.env.FINDJOY_TRIAL_CREDITS ?? SIGNUP_POINTS);
}

/**
 * 注册赠送：前 100 位注册用户固定 100 积分，之后沿用可配置的普通赠送额度。
 * 赠送本身由 ledger 的 (reason, reference) 唯一约束保证每人只到账一次；
 * 已按旧额度到账的用户不会因为本次规则变化被追发。
 */
export async function signupCredits(userId: string): Promise<number> {
  const rank = await identityStore.signupRank(userId);
  return rank > 0 && rank <= EARLY_SIGNUP_LIMIT ? EARLY_SIGNUP_POINTS : configuredTrialCredits();
}
