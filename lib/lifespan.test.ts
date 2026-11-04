import { describe, expect, it } from "vitest";
import { createStarterLife, type NextEvent } from "./life";
import { enforceLifespan, rollLifespan } from "./lifespan";

function seeded(seed: number) {
  let value = seed;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
const event: NextEvent = {
  timePassed: 5,
  story: "你八十五岁，家里换了窗。",
  event: { type: "family", title: "换窗", importance: 0.6 },
  choices: [{ id: "A", text: "留下" }],
  objectiveChanges: {},
};

describe("program-maintained lifespan", () => {
  it("keeps 90+ and 95+ lives rare without forbidding them", () => {
    const rng = seeded(20261104);
    const values = Array.from({ length: 10000 }, () => rollLifespan(rng));
    expect(Math.min(...values)).toBeGreaterThanOrEqual(60);
    expect(Math.max(...values)).toBeLessThanOrEqual(99);
    expect(values.filter(age => age >= 90).length / values.length).toBeLessThan(0.08);
    expect(values.filter(age => age >= 95).length / values.length).toBeLessThan(0.02);
  });
  it("forces a natural death when the landing age reaches the individual limit", () => {
    const state = createStarterLife({ age: 80 });
    state.lifespan = 83;
    const limited = enforceLifespan(event, state);
    expect(limited).toMatchObject({ outcome: "death", deathCause: "age", timePassed: 3, choices: [] });
    expect(limited.story).toContain("83岁");
  });
  it("does not alter lives below the limit or non-birth modes", () => {
    const state = createStarterLife({ age: 70 });
    state.lifespan = 83;
    expect(enforceLifespan(event, state)).toEqual(event);
    const script = createStarterLife({ age: 70 });
    script.scenario = { mode: "script", title: "旧剧本", startAge: 70 } as never;
    expect(enforceLifespan(event, script)).toEqual(event);
  });
  it("caps a model-written death that overshoots the limit", () => {
    const state = createStarterLife({ age: 88 });
    state.lifespan = 90;
    const limited = enforceLifespan({ ...event, outcome: "death", choices: [] }, state);
    expect(limited.timePassed).toBe(2);
    expect(limited.outcome).toBe("death");
  });
});
