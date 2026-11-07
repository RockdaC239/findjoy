import { createStartLife, resolveStartPlan } from "./modes/start";
import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { describe, expect, it } from "vitest";
import { createStarterLife } from "./life";
import { lifeStore } from "./life-store";

describe("life store", () => {
  it("persists and retrieves a life state", async () => {
    const life = createStarterLife();
    await lifeStore.set(life);

    expect((await lifeStore.get(life.lifeId))?.basic.age).toBe(0);
    expect((await lifeStore.get(life.lifeId))?.lifeId).toBe(life.lifeId);
  });

  it("overwrites an existing life on re-set", async () => {
    const life = createStarterLife();
    await lifeStore.set(life);
    life.basic.city = "杭州";
    await lifeStore.set(life);

    expect((await lifeStore.get(life.lifeId))?.basic.city).toBe("杭州");
  });

  it("returns null for a missing life", async () => {
    expect(await lifeStore.get("missing-life")).toBeNull();
  });

  it("deletes a stored life", async () => {
    const life = createStarterLife();
    await lifeStore.set(life);
    await lifeStore.delete(life.lifeId);

    expect(await lifeStore.get(life.lifeId)).toBeNull();
  });

  it("persists and overwrites a conversation transcript per life", async () => {
    const life = createStarterLife();
    const transcript = [
      { role: "user" as const, content: "第一轮输入" },
      { role: "assistant" as const, content: "第一轮输出" },
    ];
    await lifeStore.setTranscript(life.lifeId, transcript);
    expect(await lifeStore.getTranscript(life.lifeId)).toEqual(transcript);

    const extended = [...transcript, { role: "user" as const, content: "第二轮输入" }];
    await lifeStore.setTranscript(life.lifeId, extended);
    expect(await lifeStore.getTranscript(life.lifeId)).toEqual(extended);
  });

  it("returns null for a transcript of a life that never had one (legacy save)", async () => {
    const life = createStarterLife();
    await lifeStore.set(life);

    expect(await lifeStore.getTranscript(life.lifeId)).toBeNull();
  });

  it("removes the transcript together with the life", async () => {
    const life = createStarterLife();
    await lifeStore.setTranscript(life.lifeId, [{ role: "user" as const, content: "x" }]);
    await lifeStore.delete(life.lifeId);

    expect(await lifeStore.getTranscript(life.lifeId)).toBeNull();
  });

  it("collects recently-used background dimensions for the next life to avoid", async () => {
    const remarried = createStarterLife();
    remarried.flags = { bgEconomy: "小康", bgStructure: "再婚家庭", bgEvent: "机会降临", bgOpportunity: "街坊维修铺与手艺传承" };
    const upheaval = createStarterLife();
    upheaval.flags = { bgEconomy: "普通", bgStructure: "单亲", bgEvent: "家庭变故" };
    await lifeStore.set(upheaval);
    await lifeStore.set(remarried);

    const avoid = await lifeStore.recentBackgroundAvoid(5);
    expect(avoid.structure).toContain("再婚家庭");
    expect(avoid.event).toContain("家庭变故");
    expect(avoid.opportunity).toContain("街坊维修铺与手艺传承");
  });

  it("collects recent lives' main storylines for the next life to avoid", async () => {
    const athlete = createStarterLife({ age: 24 });
    athlete.career.occupation = "运动员";
    athlete.history = [{ id: "1", age: 18, type: "career", title: "进省队", story: "你加入了省队。", importance: 0.8, objectiveChanges: { occupation: "运动员" } }] as never;
    const painter = createStarterLife({ age: 30 });
    painter.career.occupation = "画家";
    painter.history = [{ id: "1", age: 22, type: "career", title: "成为画家", story: "你开始了创作。", importance: 0.8, objectiveChanges: { occupation: "画家" } }] as never;
    await lifeStore.set(painter);
    await lifeStore.set(athlete);

    const storylines = await lifeStore.recentStorylines(100);
    expect(storylines).toContain("sports");
    expect(storylines).toContain("arts");
  });

  it("lists life summaries with correct fields", async () => {
    const first = createStarterLife();
    const second = createStarterLife();
    first.basic.age = 30;
    second.basic.age = 50;
    await lifeStore.set(second);
    await lifeStore.set(first);

    const summaries = await lifeStore.listSummaries();
    const firstSummary = summaries.find((item) => item.lifeId === first.lifeId);
    expect(firstSummary?.age).toBe(30);
    expect(firstSummary?.city).toBe(first.basic.city);
    expect(summaries.some((item) => item.lifeId === second.lifeId && item.age === 50)).toBe(true);
  });
});

it("scopes history and life access to the authenticated owner, excluding legacy saves", async () => {
  const alice = createStarterLife();
  const bob = createStarterLife();
  const legacy = createStarterLife();
  await lifeStore.set(alice, "alice");
  await lifeStore.set(bob, "bob");
  await lifeStore.set(legacy);
  expect((await lifeStore.get(alice.lifeId, "alice"))?.lifeId).toBe(alice.lifeId);
  expect(await lifeStore.get(alice.lifeId, "bob")).toBeNull();
  expect(await lifeStore.get(legacy.lifeId, "alice")).toBeNull();
  expect((await lifeStore.listSummaries("alice")).map(life => life.lifeId)).toEqual([alice.lifeId]);
  await expect(async () => (await lifeStore.set({...alice, basic: {...alice.basic, city: "不应保存"}}, "bob"))).rejects.toThrow();
  expect((await lifeStore.get(alice.lifeId, "alice"))?.basic.city).toBe(alice.basic.city);
});

it("restores birth facts and collects only their recent region and parent jobs", async () => {
 const state=createStartLife(resolveStartPlan({mode:"normal"},{random:()=>0.37}),"female");
 await lifeStore.set(state,"birth-owner");
 expect((await lifeStore.get(state.lifeId,"birth-owner"))?.birth).toEqual(state.birth);
 const recent=await lifeStore.recentBackgroundAvoid(6,"birth-owner");
 expect(recent.provinceCodes).toContain(state.birth!.location.provinceCode);
 expect(recent.occupationIds).toEqual(expect.arrayContaining(state.birth!.parents.map(parent=>parent.occupation.id)));
 expect((await lifeStore.recentBackgroundAvoid(6,"other-owner")).provinceCodes).toEqual([]);
});

it("collects recent opening directions per user and skips mock or planless lives", async () => {
  const owner = createStartLife(resolveStartPlan({ mode: "normal" }, { random: () => 0.41 }), "female");
  await lifeStore.set(owner, "opening-owner");
  const plans = await lifeStore.recentOpeningPlans(6, "opening-owner");
  expect(plans).toHaveLength(1);
  expect(plans[0]).toEqual(owner.openingPlan);

  expect(await lifeStore.recentOpeningPlans(6, "other-owner")).toEqual([]);

  const mocked = createStartLife(resolveStartPlan({ mode: "normal" }, { random: () => 0.42 }), "female");
  mocked.flags.developerMock = true;
  await lifeStore.set(mocked, "opening-owner");
  const planless = createStarterLife();
  await lifeStore.set(planless, "opening-owner");
  const filtered = await lifeStore.recentOpeningPlans(6, "opening-owner");
  expect(filtered).toEqual([owner.openingPlan]);
});

it("drops an unknown opening plan instead of feeding it into the prompt", async () => {
  const state = createStarterLife();
  (state as unknown as { openingPlan: unknown }).openingPlan = { version: 1, relationship: "peer", driver: "curiosity", mechanism: "not-in-catalog" };
  await lifeStore.set(state, "opening-owner");
  const loaded = await lifeStore.get(state.lifeId, "opening-owner");
  expect(loaded?.openingPlan).toBeUndefined();
  expect(await lifeStore.recentOpeningPlans(6, "opening-owner")).toEqual([]);
});
