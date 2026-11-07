import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();

const mocks = vi.hoisted(() => ({ user: vi.fn() }));
vi.mock("./auth", () => ({ currentUser: mocks.user, appOrigin: () => "https://findfire.club" }));

import { adminStats, grantCreditsToAll, grantCreditsToUser, searchUsers } from "./admin";
import { identityStore } from "./identity-store";
import { lifeStore } from "./life-store";
import { commerceStore } from "./commerce-store";
import { createStarterLife } from "./life";
import { query } from "./database";
import { GET as getStats } from "../app/api/admin/stats/route";
import { GET as getUsers } from "../app/api/admin/users/route";
import { POST as postCredits } from "../app/api/admin/credits/route";

beforeEach(() => mocks.user.mockResolvedValue(null));

const OWNER_PHONE = "15200297440";

async function makeUser(subject: string, displayName: string) {
  return identityStore.resolveUser("admin-test", subject, displayName);
}

async function makeOwner() {
  return identityStore.resolveUser("admin-test", "owner", "owner", OWNER_PHONE);
}

async function makeLife(userId: string, age: number, mock = false) {
  const life = createStarterLife({ age });
  life.basic.age = age;
  if (mock) life.flags.developerMock = true;
  await lifeStore.set(life, userId);
  return life;
}

function creditsRequest(body: Record<string, unknown>, key = randomUUID(), origin = "https://findfire.club") {
  return new Request("https://findfire.club/findjoy/api/admin/credits", {
    method: "POST",
    headers: { origin, "Content-Type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify(body),
  });
}

it("counts registered users, real play sessions and the oldest age without mock lives", async () => {
  const first = await makeUser("first", "第一位");
  const second = await makeUser("second", "第二位");
  await makeLife(first.id, 42);
  await makeLife(second.id, 81);
  await makeLife(first.id, 120, true);

  expect(await adminStats()).toEqual({ users: 2, plays: 2, maxAge: 81 });
});

it("searches users by display name or exact id and returns their play summary", async () => {
  const target = await makeUser("target", "林小满");
  const other = await makeUser("other", "另一位");
  await makeLife(target.id, 37);
  await grantCreditsToUser(target.id, 300, randomUUID());

  expect((await searchUsers("林小")).map((user) => user.id)).toEqual([target.id]);
  expect((await searchUsers(target.id)).map((user) => user.id)).toEqual([target.id]);
  expect((await searchUsers(target.id.slice(0, 8))).map((user) => user.id)).toEqual([target.id]);
  expect(await searchUsers("没有这个人")).toEqual([]);
  const [found] = await searchUsers("林小满");
  expect(found).toMatchObject({ id: target.id, displayName: "林小满", balance: 300, lives: 1, maxAge: 37 });
  expect((await searchUsers("另一")).map((user) => user.id)).toEqual([other.id]);
});

it("lists users in registration order with their signup rank and registration time", async () => {
  const first = await makeUser("first", "第一位");
  const second = await makeUser("second", "第二位");
  await query("UPDATE identity_users SET created_at=1 WHERE user_id=$1", [first.id]);
  await query("UPDATE identity_users SET created_at=2 WHERE user_id=$1", [second.id]);

  const rows = await searchUsers("");
  expect(rows.map((user) => user.id)).toEqual([first.id, second.id]);
  expect(rows.map((user) => user.signupRank)).toEqual([1, 2]);
  expect(rows.map((user) => user.createdAt)).toEqual([1, 2]);
});

it("grants credits to one user once for repeated keys and records the ledger", async () => {
  const target = await makeUser("target", "指定用户");
  const key = randomUUID();

  const [first, second] = await Promise.all([
    grantCreditsToUser(target.id, 300, key),
    grantCreditsToUser(target.id, 300, key),
  ]);
  expect([first.recipients, second.recipients].sort()).toEqual([0, 1]);
  expect((await commerceStore.balance(target.id)).available).toBe(300);
  expect(await commerceStore.ledger(target.id)).toHaveLength(1);
  expect((await commerceStore.ledger(target.id))[0]).toMatchObject({ delta: 300, reason: "admin_grant" });

  await expect(grantCreditsToUser(target.id, 0, randomUUID())).rejects.toThrow("积分数量");
  await expect(grantCreditsToUser(randomUUID(), 100, randomUUID())).rejects.toThrow("没有找到这个用户");
});

it("grants credits to every registered user once and keeps accounts in sync", async () => {
  const first = await makeUser("first", "第一位");
  const second = await makeUser("second", "第二位");
  const key = randomUUID();

  const granted = await grantCreditsToAll(100, key);
  expect(granted).toMatchObject({ scope: "all", amount: 100, recipients: 2 });
  expect(await grantCreditsToAll(100, key)).toMatchObject({ recipients: 0 });
  expect((await commerceStore.balance(first.id)).available).toBe(100);
  expect((await commerceStore.balance(second.id)).available).toBe(100);
  expect(await commerceStore.ledger(first.id)).toHaveLength(1);
  expect(await commerceStore.ledger(second.id)).toHaveLength(1);
});

it("guards admin reads and writes behind the developer account and same origin", async () => {
  const owner = await makeOwner();
  const stranger = await makeUser("stranger", "普通用户");
  const target = await makeUser("target", "目标用户");

  expect((await getStats()).status).toBe(401);
  expect((await postCredits(creditsRequest({ scope: "all", amount: 100 }))).status).toBe(401);

  mocks.user.mockResolvedValue(stranger);
  expect((await getStats()).status).toBe(403);
  expect((await getUsers(new Request("https://findfire.club/findjoy/api/admin/users"))).status).toBe(403);
  expect((await postCredits(creditsRequest({ scope: "all", amount: 100 }))).status).toBe(403);

  mocks.user.mockResolvedValue(owner);
  expect((await getStats()).status).toBe(200);
  expect((await getUsers(new Request("https://findfire.club/findjoy/api/admin/users?q=目标"))).status).toBe(200);
  expect((await postCredits(creditsRequest({ scope: "user", userId: target.id, amount: 50 }, randomUUID(), "https://evil.example"))).status).toBe(403);

  const response = await postCredits(creditsRequest({ scope: "user", userId: target.id, amount: 50 }));
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({ scope: "user", amount: 50, recipients: 1, balance: { available: 50 } });
  expect((await commerceStore.balance(target.id)).available).toBe(50);
});
