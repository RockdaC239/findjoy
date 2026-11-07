import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { afterEach, expect, it, vi } from "vitest";
import { identityStore } from "./identity-store";
import { signupCredits } from "./signup";
import { query } from "./database";
import { EARLY_SIGNUP_LIMIT, EARLY_SIGNUP_POINTS } from "./points";

afterEach(() => vi.unstubAllEnvs());

it("gives the first 100 registered users 100 points and falls back afterwards", async () => {
  vi.stubEnv("FINDJOY_TRIAL_CREDITS", "20");
  const users = [];
  for (let index = 0; index < EARLY_SIGNUP_LIMIT + 1; index += 1) {
    const user = await identityStore.resolveUser("signup-test", `user-${index}`, `用户${index}`);
    // 固定注册时间，避免同一毫秒内的排位依赖随机 UUID。
    await query("UPDATE identity_users SET created_at=$1 WHERE user_id=$2", [index + 1, user.id]);
    users.push(user);
  }

  expect(await signupCredits(users[0].id)).toBe(EARLY_SIGNUP_POINTS);
  expect(await signupCredits(users[EARLY_SIGNUP_LIMIT - 1].id)).toBe(EARLY_SIGNUP_POINTS);
  expect(await signupCredits(users[EARLY_SIGNUP_LIMIT].id)).toBe(20);
});
