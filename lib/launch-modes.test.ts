import { afterEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ currentUser: vi.fn() }));
vi.mock("./auth", () => ({ currentUser: mocks.currentUser, appOrigin: () => "https://findfire.club" }));
import { POST } from "../app/api/life/start/route";
import { lifeStore } from "./life-store";

afterEach(() => lifeStore.close());
it.each([
  { mode: "script", scriptId: "1980s-factory-succession" },
  { mode: "theme", theme: "love" },
  { mode: "foru", brief: {} },
])("rejects unavailable launch mode before granting points or creating a life: %j", async (body) => {
  mocks.currentUser.mockResolvedValue({ id: "launch-user" });
  const response = await POST(new Request("https://findfire.club/findjoy/api/life/start", {
    method: "POST", headers: { origin: "https://findfire.club", "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  expect(response.status).toBe(403);
  expect(await response.json()).toMatchObject({ code: "MODE_UNAVAILABLE" });
  expect(lifeStore.listSummaries("launch-user")).toEqual([]);
});

it.each([{ mode: "normal" }, {}])("keeps normal and default openings available: %j", async (body) => {
  mocks.currentUser.mockResolvedValue({ id: "launch-user" });
  const response = await POST(new Request("https://findfire.club/findjoy/api/life/start", {
    method: "POST", headers: { origin: "https://findfire.club", "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  expect(response.status).toBe(400);
  expect(await response.json()).toEqual({ error: "缺少有效请求标识" });
});
