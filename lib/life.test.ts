import { describe, expect, it } from "vitest";
import { applyNextEvent, buildEnding, createStarterLife, type NextEvent } from "./life";
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
    const nextLife = applyNextEvent(startingLife, event, event.choices[0]);

    expect(nextLife.basic.age).toBe(20);
    expect(nextLife.career).toMatchObject({ occupation: "产品经理", incomeYearly: 180000 });
    expect(nextLife.finance.cash).toBe(20000);
    expect(nextLife.history).toHaveLength(1);
    expect(nextLife.majorMemories).toEqual(["第一次为自己选择离开。"]);
  });

  it("ends a life at the final age and returns a score-free review", () => {
    const life = createStarterLife({ age: 87 });
    const endingLife = applyNextEvent(life, event, event.choices[0]);
    const ending = buildEnding(endingLife);

    expect(endingLife.dead).toBe(true);
    expect(ending.age).toBe(89);
    expect(ending).not.toHaveProperty("score");
    expect(ending.question).toContain("再活一次");
  });
});
