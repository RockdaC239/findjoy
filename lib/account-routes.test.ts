import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("./auth", () => ({ currentUser: mocks.currentUser, appOrigin: () => "https://findfire.club" }));
import { PATCH } from "../app/api/account/route";
import { identityStore } from "./identity-store";
import { lifeStore } from "./life-store";

beforeEach(() => mocks.currentUser.mockResolvedValue(null));
afterEach(async () => (await lifeStore.close()));
const request = (body: unknown, origin = "https://findfire.club") => new Request("https://findfire.club/findjoy/api/account", { method: "PATCH", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });

it("requires login, checks origin, validates nickname and updates only the session owner", async () => {
  expect((await PATCH(request({ displayName: "新昵称" }))).status).toBe(401);
  const user = await identityStore.resolveUser("https://auth.example", "owner");
  const other = await identityStore.resolveUser("https://auth.example", "other");
  mocks.currentUser.mockResolvedValue(user);
  expect((await PATCH(request({ displayName: "新昵称" }, "https://evil.example"))).status).toBe(403);
  for (const displayName of [null, "", "a".repeat(81), "a\nb"]) expect((await PATCH(request({ displayName }))).status).toBe(400);
  expect((await PATCH(request({ displayName: "新昵称", userId: other.id }))).status).toBe(200);
  expect((await identityStore.getSession((await identityStore.createSession(user.id)).token))?.displayName).toBe("新昵称");
  expect((await identityStore.getSession((await identityStore.createSession(other.id)).token))?.displayName).toBe("探索者");
});
