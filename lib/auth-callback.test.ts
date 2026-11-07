import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ loginToken: "" }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: (name: string) => name === "findjoy_login" ? { value: mocks.loginToken } : undefined }) }));
vi.mock("./authing", () => ({ authenticateCallback: async () => ({ issuer: "https://auth.example", subject: "owner", displayName: "探索者", phone: "+8613800000000" }) }));

import { GET } from "../app/api/auth/callback/route";
import { identityStore } from "./identity-store";
import { lifeStore } from "./life-store";
import { commerceStore } from "./commerce-store";

afterEach(async () => { await lifeStore.close(); vi.unstubAllEnvs(); });

it("persists the verified phone during the callback and reads it for the newly issued session owner", async () => {
  vi.stubEnv("FINDJOY_APP_ORIGIN", "http://localhost:3000");
  vi.stubEnv("FINDJOY_TRIAL_CREDITS", undefined);
  const previous = await identityStore.resolveUser("https://auth.example", "owner");
  expect(await identityStore.getPhone(previous.id)).toBeNull();
  mocks.loginToken = (await identityStore.beginLogin({ state: "state", nonce: "nonce", verifier: "pkce", returnTo: "/findjoy/account" }));
  const response = await GET(new Request("http://localhost:3000/findjoy/api/auth/callback?code=test"));
  expect(response.headers.get("location")).toBe("http://localhost:3000/findjoy/account");
  const session = await identityStore.getSession(response.cookies.get("findjoy_session")!.value);
  expect(session?.id).toBe(previous.id);
  expect(await identityStore.getPhone(session!.id)).toBe("+8613800000000");
  expect((await commerceStore.balance(session!.id)).available).toBe(100);
});
