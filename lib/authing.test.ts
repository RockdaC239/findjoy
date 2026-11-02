import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ claims: {} as Record<string, unknown>, userInfo: vi.fn() }));

vi.mock("openid-client", async importOriginal => {
  const oidc = await importOriginal<typeof import("openid-client")>();
  return {
    ...oidc,
    discovery: vi.fn(async () => new oidc.Configuration({
      issuer: "https://auth.example",
      authorization_endpoint: "https://auth.example/oidc/auth",
      token_endpoint: "https://auth.example/oidc/token",
      userinfo_endpoint: "https://auth.example/oidc/me",
    }, "test-client")),
    authorizationCodeGrant: vi.fn(async () => ({ access_token: "test-access-token", claims: () => mocks.claims })),
    fetchUserInfo: mocks.userInfo,
  };
});

import { authenticateCallback, authorizationRequest } from "./authing";

afterEach(() => vi.unstubAllEnvs());

it("requires fresh authentication instead of silently reusing the provider session", async () => {
  vi.stubEnv("AUTHING_ISSUER", "https://auth.example");
  vi.stubEnv("AUTHING_CLIENT_ID", "test-client");
  vi.stubEnv("FINDJOY_APP_ORIGIN", "http://localhost:3000");
  const first = await authorizationRequest("/findjoy/account");
  const second = await authorizationRequest("/findjoy");
  expect(first.url.searchParams.get("prompt")).toBe("login");
  expect(first.url.searchParams.get("scope")).toBe("openid profile phone");
  expect(first.url.searchParams.get("code_challenge_method")).toBe("S256");
  expect(first.url.searchParams.get("state")).toBe(first.pending.state);
  expect(first.url.searchParams.get("nonce")).toBe(first.pending.nonce);
  expect(first.pending.state).not.toBe(second.pending.state);
  expect(first.pending.verifier).not.toBe(second.pending.verifier);
});

it("reads UserInfo when ID token phone is null or lacks verification", async () => {
  vi.stubEnv("AUTHING_ISSUER", "https://auth.example");
  vi.stubEnv("AUTHING_CLIENT_ID", "test-client");
  vi.stubEnv("FINDJOY_APP_ORIGIN", "http://localhost:3000");
  for (const phone of [null, "", "13800000000"]) {
    mocks.claims = { sub: "owner", phone_number: phone, phone_number_verified: false };
    mocks.userInfo.mockResolvedValue({ sub: "owner", phone_number: "13800000000", phone_number_verified: true });
    const identity = await authenticateCallback(new Request("http://localhost:3000/findjoy/api/auth/callback?code=test"), { state: "state", nonce: "nonce", verifier: "pkce", returnTo: "/findjoy" });
    expect(identity.phone).toBe("13800000000");
    expect(mocks.userInfo).toHaveBeenCalledWith(expect.anything(), "test-access-token", "owner");
  }
});
