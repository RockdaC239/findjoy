import { describe, expect, it } from "vitest";
import { applyNextEvent, buildEnding, computeDeathChance, createStarterLife, resolveOfferedChoice, type NextEvent } from "./life";
import { buildFallbackEvent } from "./model-adapter";

const event: NextEvent = {
  timePassed: 2,
  story: "你把一个新的可能留给了未来。",
  event: { type: "career", title: "新的工作", importance: 0.8 },
  choices: [{ id: "A", text: "接受" }],
  objectiveChanges: { cash: 12000, incomeYearly: 180000, occupation: "产品经理" },
  memory: "第一次为自己选择离开。",
};

describe("life state", () => {
  it("starts a new life at birth", () => {
    const life = createStarterLife();

    expect(life.basic.age).toBe(0);
    expect(life.career.occupation).toBe("婴儿");
  });

  it("honors a chosen gender and assigns a city from the catalog", () => {
    const life = createStarterLife({ gender: "female" });

    expect(life.basic.gender).toBe("female");
    expect(["深圳", "上海", "北京", "杭州", "成都", "广州", "南京", "武汉", "西安", "重庆", "苏州", "天津"]).toContain(life.basic.city);
  });

  it("opens a newborn life with a childhood event", () => {
    const event = buildFallbackEvent(createStarterLife());

    expect(event.event.type).toBe("family");
    expect(event.event.title).toBeTruthy();
    expect(event.timePassed).toBeGreaterThan(0);
  });

  it("keeps fallback narration anonymous and varies a new life's opening", () => {
    const first = createStarterLife();
    const second = createStarterLife();
    first.lifeId = "00000000-0000-0000-0000-000000000001";
    second.lifeId = "ffffffff-ffff-ffff-ffff-ffffffffffff";
    const firstEvent = buildFallbackEvent(first);
    const secondEvent = buildFallbackEvent(second);

    expect(JSON.stringify(firstEvent)).not.toMatch(/陈予安|林夏/);
    expect(JSON.stringify(secondEvent)).not.toMatch(/陈予安|林夏/);
    expect(firstEvent.story).not.toBe(secondEvent.story);
  });

  it("records a chosen event, advances age, and applies objective changes", () => {
    const startingLife = createStarterLife({ age: 18, city: "成都" });
    const nextLife = applyNextEvent(startingLife, event, event.choices[0], { random: () => 1 });

    expect(nextLife.basic.age).toBe(20);
    expect(nextLife.career).toMatchObject({ occupation: "产品经理", incomeYearly: 180000 });
    expect(nextLife.finance.cash).toBe(20000);
    expect(nextLife.history).toHaveLength(1);
    expect(nextLife.majorMemories).toEqual(["第一次为自己选择离开。"]);
  });

  it("does not die from a probability roll that always misses", () => {
    const life = createStarterLife({ age: 30 });
    const aliveLife = applyNextEvent(life, event, event.choices[0], { random: () => 1 });

    expect(aliveLife.dead).toBe(false);
    expect(aliveLife.basic.age).toBe(32);
  });

  it("does not roll natural death for young healthy lives (below 50)", () => {
    const life = createStarterLife({ age: 27 });
    life.health.physical = 92;
    expect(computeDeathChance(life, 4)).toBe(0);
    const aliveLife = applyNextEvent(life, { ...event, timePassed: 4 }, event.choices[0], { random: () => 0.5 });
    expect(aliveLife.dead).toBe(false);
    expect(aliveLife.basic.age).toBe(31);
  });

  it("marks death when the probability roll succeeds", () => {
    const life = createStarterLife({ age: 89 });
    const deadLife = applyNextEvent(life, event, event.choices[0], { random: () => 0 });

    expect(deadLife.dead).toBe(true);
    expect(deadLife.flags.deathCause).toBe("accident");
  });

  it("forces death at a very old age and returns a score-free review", () => {
    const life = createStarterLife({ age: 94 });
    const endingLife = applyNextEvent(life, event, event.choices[0], { random: () => 1 });
    const ending = buildEnding(endingLife);

    expect(endingLife.dead).toBe(true);
    expect(endingLife.flags.deathCause).toBe("age");
    expect(ending.age).toBe(96);
    expect(ending).not.toHaveProperty("score");
    expect(ending.question).toContain("再活一次");
  });

  it("records a disease death cause when health reaches zero", () => {
    const life = createStarterLife({ age: 45 });
    life.health.physical = 2;
    const deadLife = applyNextEvent(
      life,
      { ...event, objectiveChanges: { physical: -3 } },
      event.choices[0],
      { random: () => 1 },
    );

    expect(deadLife.dead).toBe(true);
    expect(deadLife.flags.deathCause).toBe("disease");
  });

  it("stores the full offered choices and a per-node timestamp and usage on each node", () => {
    const life = createStarterLife({ age: 18 });
    const nextLife = applyNextEvent(life, { ...event, usage: { promptTokens: 100, completionTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01, provider: "http://x", model: "m", promptCacheHitTokens: 90, promptCacheMissTokens: 10 } }, event.choices[0], { random: () => 1 });
    const node = nextLife.history[0];

    expect(node.choices).toEqual([{ id: "A", text: "接受" }]);
    expect(node.choiceId).toBe("A");
    expect(node.choiceText).toBe("接受");
    expect(node.storedAt).toBeTruthy();
    expect(node.usage).toMatchObject({ promptTokens: 100, promptCacheHitTokens: 90 });
  });

  it("keeps the opening node pending until the player chooses, then attributes the choice to it", () => {
    const opening = { ...event, timePassed: 5 };
    const openedLife = applyNextEvent(createStarterLife(), opening, undefined, { rollDeath: false });
    expect(openedLife.history).toHaveLength(1);
    expect(openedLife.history[0]).toMatchObject({ age: 5, story: opening.story, choices: [{ id: "A", text: "接受" }] });
    expect(openedLife.history[0].choiceId).toBeUndefined();
    expect(openedLife.history[0].choiceText).toBeUndefined();
    expect(openedLife.dead).toBe(false);

    const nextEvent = { ...event, timePassed: 3, story: "你带着那个可能往前走了一段。" };
    const decidedLife = applyNextEvent(openedLife, nextEvent, { id: "A", text: "接受" }, { random: () => 1 });

    expect(decidedLife.history).toHaveLength(2);
    // 开局节点的选择被补挂到开局节点上，而不是新节点上（消除错位一格）
    expect(decidedLife.history[0].choiceId).toBe("A");
    expect(decidedLife.history[0].choiceText).toBe("接受");
    // 新节点以待定状态入列，且记录了自己提供的选项
    expect(decidedLife.history[1]).toMatchObject({ age: 8, story: nextEvent.story, choices: [{ id: "A", text: "接受" }] });
    expect(decidedLife.history[1].choiceId).toBeUndefined();
  });

  it("does not attach a choice to a node that offered none (childhood pure narrative)", () => {
    const opening = applyNextEvent(createStarterLife(), { ...event, choices: [] }, undefined, { rollDeath: false });
    const nextLife = applyNextEvent(opening, { ...event, story: "命运把你带到了新的地方。" }, { id: "A", text: "接受" }, { random: () => 1 });

    // 童年开局节点（无可选项）保持纯净；选择兜底挂到提供了选项的新节点上
    expect(nextLife.history[0].choiceText).toBeUndefined();
    expect(nextLife.history[1].choiceText).toBe("接受");
  });

  it("never completes a node twice or with a fabricated 'none' choice", () => {
    const life = applyNextEvent(createStarterLife(), event, undefined, { rollDeath: false });
    const once = applyNextEvent(life, { ...event, story: "第一次推进。" }, { id: "A", text: "接受" }, { random: () => 1 });
    const twice = applyNextEvent(once, { ...event, story: "第二次推进。" }, { id: "B", text: "改变方向" }, { random: () => 1 });

    expect(twice.history[0].choiceText).toBe("接受");
    expect(twice.history[1].choiceText).toBe("改变方向");
    expect(twice.history[2].choiceText).toBeUndefined();

    const noneLife = applyNextEvent(life, { ...event, story: "带 none 选择。" }, { id: "none", text: "继续生活" }, { random: () => 1 });
    expect(noneLife.history[0].choiceText).toBeUndefined();
  });
});

describe("resolveOfferedChoice", () => {
  const pending = { choices: [{ id: "A", text: "去北京追梦" }, { id: "B", text: "留在重庆接班" }, { id: "C", text: "先答应父亲" }] } as never;

  it("maps a client choice to the model-offered text by id", () => {
    expect(resolveOfferedChoice({ id: "B", text: "在熟悉的节奏里再停留一会儿" }, pending)).toEqual({ id: "B", text: "留在重庆接班" });
  });

  it("keeps the raw choice when the id has no offered match", () => {
    const raw = { id: "X", text: "自定义选择" };
    expect(resolveOfferedChoice(raw, pending)).toEqual(raw);
  });

  it("passes through undefined choice (childhood) and legacy nodes without choices", () => {
    expect(resolveOfferedChoice(undefined, pending)).toBeUndefined();
    expect(resolveOfferedChoice({ id: "A", text: "接受" }, undefined)).toEqual({ id: "A", text: "接受" });
  });
});
