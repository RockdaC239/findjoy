import { afterEach, describe, expect, it } from "vitest";
import { identityStore } from "./identity-store";
import { getDb, lifeStore } from "./life-store";

afterEach(() => lifeStore.close());

describe("shared identity boundary", () => {
  it("keeps a global UUID stable across logins without using the provider subject as its ID", () => {
    const first = identityStore.resolveUser("https://identity.example/oidc", "external-1", "探索者");
    const again = identityStore.resolveUser("https://identity.example/oidc", "external-1", "新的昵称");
    expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(again.id).toBe(first.id);
    expect(again.displayName).toBe("新的昵称");
    expect(identityStore.resolveUser("https://another.example/oidc", "external-1").id).not.toBe(first.id);
  });

  it("does not store the bearer session token, and enforces expiration and revocation", () => {
    const user = identityStore.resolveUser("https://identity.example/oidc", "external-1");
    const session = identityStore.createSession(user.id, 1_000, 60_000);
    expect(identityStore.getSession(session.token, 2_000)?.id).toBe(user.id);
    const row = getDb().prepare("SELECT token_hash FROM identity_sessions").get() as { token_hash: string };
    expect(row.token_hash).not.toBe(session.token);
    expect(identityStore.getSession(session.token, 61_000)).toBeNull();
    const second = identityStore.createSession(user.id);
    identityStore.revokeSession(second.token);
    expect(identityStore.getSession(second.token)).toBeNull();
    expect(identityStore.getSession("forged")).toBeNull();
  });

  it("does not allow a session for an unknown user and bounds profile display names", () => {
    expect(() => identityStore.createSession("unknown")).toThrow();
    const user = identityStore.resolveUser("https://identity.example/oidc", "external-1", "a".repeat(200));
    expect(user.displayName.length).toBe(80);
    expect(() => identityStore.resolveUser("", "external-1")).toThrow();
    expect(() => identityStore.resolveUser("https://identity.example/oidc", "")).toThrow();
  });
});

describe("login transaction", () => {
  it("is single use and expires so a callback cannot be replayed", () => {
    const pending = { state: "random-state", nonce: "random-nonce", verifier: "pkce", returnTo: "/findjoy" };
    const token = identityStore.beginLogin(pending, 1_000);
    expect(identityStore.consumeLogin(token, 2_000)).toEqual(pending);
    expect(identityStore.consumeLogin(token, 3_000)).toBeNull();
    const expired = identityStore.beginLogin(pending, 1_000);
    expect(identityStore.consumeLogin(expired, 602_000)).toBeNull();
  });
});
