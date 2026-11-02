import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("./auth", () => ({ currentUser: mocks.currentUser, appOrigin: () => "https://findfire.club" }));
import { GET as listLives } from "../app/api/lives/route";
import { GET as getLife } from "../app/api/life/[id]/route";
import { POST as startLife } from "../app/api/life/start/route";
import { POST as nextLife } from "../app/api/life/[id]/next/route";
import { POST as ending } from "../app/api/life/[id]/ending/route";
import { createStarterLife } from "./life";
import { lifeStore } from "./life-store";

beforeEach(async () => { await lifeStore.close(); mocks.currentUser.mockResolvedValue(null); });

describe("life API authorization", () => {
  it("rejects unauthenticated reads and generation before any model work", async () => {
    const request = new Request("https://findfire.club/findjoy/api/life/test");
    const params = { params: Promise.resolve({ id: "test" }) };
    for (const response of [await listLives(), await getLife(request, params), await startLife(request), await nextLife(request, params), await ending(request, params)]) {
      expect(response.status).toBe(401);
    }
  });
  it("returns 404 for another user's or a legacy life, and lists only owned saves", async () => {
    mocks.currentUser.mockResolvedValue({ id: "alice", displayName: "探索者" });
    const alice = createStarterLife(), bob = createStarterLife(), legacy = createStarterLife();
    await lifeStore.set(alice, "alice"); await lifeStore.set(bob, "bob"); await lifeStore.set(legacy);
    const params = { params: Promise.resolve({ id: bob.lifeId }) };
    expect((await getLife(new Request("https://findfire.club"), params)).status).toBe(404);
    const body = await (await listLives()).json();
    expect(body.lives.map((life: { lifeId: string }) => life.lifeId)).toEqual([alice.lifeId]);
  });
  it("rejects cross-site authenticated writes before reading a save or generating", async () => {
    mocks.currentUser.mockResolvedValue({ id: "alice" });
    const request = new Request("https://findfire.club/findjoy/api/life/start", { method: "POST", headers: {origin:"https://evil.test"} });
    const params = {params:Promise.resolve({id:"anything"})};
    expect((await startLife(request)).status).toBe(403);
    expect((await nextLife(request, params)).status).toBe(403);
    expect((await ending(request, params)).status).toBe(403);
  });
});
