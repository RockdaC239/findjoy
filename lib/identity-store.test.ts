import { describe, expect, it } from "vitest";
import { identityStore } from "./identity-store";
import { getPostgresPool } from "./database";
import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();

describe("shared identity boundary on PostgreSQL", () => {
  it("preserves edited nicknames across logins and sessions", async () => {
    const user = await identityStore.resolveUser("https://identity.example", "owner");
    const session = await identityStore.createSession(user.id);
    await identityStore.updateDisplayName(user.id, "  小橙  ");
    await identityStore.resolveUser("https://identity.example", "owner", "供应商昵称");
    expect((await identityStore.getSession(session.token))?.displayName).toBe("小橙");
    for (const name of ["", " ", "a".repeat(81), "名字\n下一行"]) {
      await expect(identityStore.updateDisplayName(user.id, name)).rejects.toThrow();
    }
  });

  it("reads existing profile rows without request-time schema changes", async () => {
    await getPostgresPool().query("INSERT INTO identity_users(user_id,display_name,created_at) VALUES ('legacy','原昵称',1)");
    const session = await identityStore.createSession("legacy");
    expect(await identityStore.getSession(session.token)).toMatchObject({ id: "legacy", displayName: "原昵称" });
    expect(await identityStore.getPhone("legacy")).toBeNull();
  });

  it("stores phone updates only for the matching identity without exposing them in navigation profiles", async () => {
    const user = await identityStore.resolveUser("https://identity.example", "owner", "探索者", "+8613800000000");
    const other = await identityStore.resolveUser("https://identity.example", "other");
    expect(await identityStore.getPhone(user.id)).toBe("+8613800000000");
    expect(await identityStore.getPhone(other.id)).toBeNull();
    expect(await identityStore.getSession((await identityStore.createSession(user.id)).token)).not.toHaveProperty("phone");
    await identityStore.resolveUser("https://identity.example", "owner", "探索者", null);
    expect(await identityStore.getPhone(user.id)).toBeNull();
  });

  it("keeps a global UUID stable across logins and isolates issuers", async () => {
    const first = await identityStore.resolveUser("https://identity.example/oidc", "external-1", "探索者");
    const again = await identityStore.resolveUser("https://identity.example/oidc", "external-1", "新的昵称");
    expect(first.id).toMatch(/^[a-f0-9-]{36}$/);
    expect(again.id).toBe(first.id);
    expect(again.displayName).toBe("新的昵称");
    expect((await identityStore.resolveUser("https://another.example/oidc", "external-1")).id).not.toBe(first.id);
  });

  it("hashes session tokens and enforces expiration and revocation", async () => {
    const user = await identityStore.resolveUser("https://identity.example/oidc", "external-1");
    const session = await identityStore.createSession(user.id, 1000, 60000);
    expect((await identityStore.getSession(session.token, 2000))?.id).toBe(user.id);
    const row = (await getPostgresPool().query("SELECT token_hash FROM identity_sessions")).rows[0];
    expect(row.token_hash).not.toBe(session.token);
    expect(await identityStore.getSession(session.token, 61000)).toBeNull();
    const second = await identityStore.createSession(user.id);
    await identityStore.revokeSession(second.token);
    expect(await identityStore.getSession(second.token)).toBeNull();
    expect(await identityStore.getSession("forged")).toBeNull();
  });

  it("rejects unknown session owners and invalid identities and bounds display names", async () => {
    await expect(identityStore.createSession("unknown")).rejects.toThrow();
    const user = await identityStore.resolveUser("https://identity.example/oidc", "external-1", "a".repeat(200));
    expect(user.displayName.length).toBe(80);
    await expect(identityStore.resolveUser("", "external-1")).rejects.toThrow();
    await expect(identityStore.resolveUser("https://identity.example/oidc", "")).rejects.toThrow();
  });
});

it("allows callback consumption once and rejects expired callbacks", async () => {
  const pending = { state: "state", nonce: "nonce", verifier: "pkce", returnTo: "/findjoy" };
  const token = await identityStore.beginLogin(pending, 1000);
  expect(await identityStore.consumeLogin(token, 2000)).toEqual(pending);
  expect(await identityStore.consumeLogin(token, 3000)).toBeNull();
  const expired = await identityStore.beginLogin(pending, 1000);
  expect(await identityStore.consumeLogin(expired, 602000)).toBeNull();
});

it("maps simultaneous logins to one persisted UUID and consumes callbacks atomically", async () => {
  const users = await Promise.all(Array.from({ length: 10 }, () => identityStore.resolveUser("https://auth.example", "same")));
  expect(new Set(users.map(user => user.id)).size).toBe(1);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS count FROM identity_links")).rows).toEqual([{ count: 1 }]);
  expect((await getPostgresPool().query("SELECT count(*)::integer AS count FROM identity_users")).rows).toEqual([{ count: 1 }]);
  const pending = { state: "s", nonce: "n", verifier: "v", returnTo: "/findjoy" };
  const token = await identityStore.beginLogin(pending);
  const consumed = await Promise.all(Array.from({ length: 10 }, () => identityStore.consumeLogin(token)));
  expect(consumed.filter(Boolean)).toEqual([pending]);
});
