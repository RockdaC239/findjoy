import { beforeEach, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
const mocks = vi.hoisted(() => ({ user: vi.fn(), stream: vi.fn(), ending: vi.fn() }));
vi.mock("./auth", () => ({ currentUser: mocks.user, appOrigin: () => "https://findfire.club" }));
vi.mock("./model-adapter", async original => ({ ...await original<typeof import("./model-adapter")>(), streamNextEvent: mocks.stream, generateEnding: mocks.ending }));
import { identityStore } from "./identity-store";
import { commerceStore } from "./commerce-store";
import { buildFallbackEvent } from "./model-adapter";
import { POST as start } from "../app/api/life/start/route";
import { POST as next } from "../app/api/life/[id]/next/route";
import { POST as ending } from "../app/api/life/[id]/ending/route";
import { POST as settings } from "../app/api/developer/route";
import type { LifeState } from "./life";
import { parseSseMessages } from "./sse";
const cookie = "findjoy_developer=1; findjoy_mock=1";
function request(body: unknown = {}, mock = true) { return new Request("https://findfire.club/findjoy/api/life/start", { method: "POST", headers: { origin: "https://findfire.club", "Content-Type": "application/json", "Idempotency-Key": randomUUID(), cookie: mock ? cookie : "" }, body: JSON.stringify(body) }); }
async function state(response: Response): Promise<LifeState> {
  expect(response.status).toBe(200);
  const messages = parseSseMessages(await response.text()).messages;
  const completed = messages.find(message => message.event === "complete");
  expect(completed).toBeDefined();
  return JSON.parse(completed!.data).state;
}
beforeEach(async () => {
  mocks.stream.mockReset(); mocks.ending.mockReset();
  mocks.user.mockResolvedValue(await identityStore.resolveUser("test", "owner", "owner", "15200297440"));
  vi.stubEnv("FINDJOY_TRIAL_CREDITS", "40");
});
it("uses real routes for exactly three mock chapters and a cached mock review without spending points or calling models", async () => {
  let life = await state(await start(request()));
  const user = await mocks.user();
  expect(await commerceStore.balance(user.id)).toEqual({ available: 40, held: 0 });
  expect(life.basic.age).toBe(8);
  const params = { params: Promise.resolve({ id: life.lifeId }) };
  life = await state(await next(request({ expectedEventId: life.history.at(-1)!.id }), params));
  expect(life.basic.age).toBe(32); expect(life.history.at(-1)!.choices).toHaveLength(3);
  life = await state(await next(request({ expectedEventId: life.history.at(-1)!.id, choice: life.history.at(-1)!.choices![0] }), params));
  expect(life.dead).toBe(true); expect(life.history).toHaveLength(3);
  const response = await ending(request(), params);
  expect(response.status).toBe(200); expect((await response.json()).ending.age).toBe(81);
  expect((await ending(request(), params)).status).toBe(200);
  expect(mocks.stream).not.toHaveBeenCalled(); expect(mocks.ending).not.toHaveBeenCalled();
  expect(await commerceStore.balance(user.id)).toEqual({ available: 40, held: 0 });
});
it("restores real model generation when mock is off and charges normal new lives", async () => {
  let life = await state(await start(request()));
  mocks.stream.mockImplementation(async function* (life: LifeState) { return buildFallbackEvent(life); });
  life = await state(await next(request({ expectedEventId: life.history.at(-1)!.id }, false), { params: Promise.resolve({ id: life.lifeId }) }));
  expect(mocks.stream).toHaveBeenCalledTimes(1); expect(life.flags.developerMock).toBe(false);
  await state(await start(request({}, false)));
  expect(mocks.stream).toHaveBeenCalledTimes(2);
  expect((await commerceStore.balance((await mocks.user()).id)).available).toBe(20);
});
it("rejects forged mock cookies for ordinary users before generation or billing", async () => {
  mocks.user.mockResolvedValue(await identityStore.resolveUser("test", "ordinary"));
  expect((await start(request())).status).toBe(403);
  expect(mocks.stream).not.toHaveBeenCalled();
  expect((await commerceStore.balance((await mocks.user()).id)).available).toBe(0);
});
it("persists mode with HTTP-only cookies and exits with mock off", async () => {
  const active = await settings(request({ enabled: true, mock: true }));
  expect(active.status).toBe(200); expect(active.headers.get("set-cookie")).toContain("HttpOnly");
  const exit = await settings(request({ enabled: false, mock: true }));
  expect(await exit.json()).toEqual({ enabled: false, mock: false });
  mocks.user.mockResolvedValue(await identityStore.resolveUser("test", "ordinary"));
  expect((await settings(request({ enabled: true, mock: true }))).status).toBe(403);
});
