import { describe, expect, it } from "vitest";
import { applyNextEvent, createStarterLife, type NextEvent } from "../life";
import { createStartLife, parseStartLifeRequest, previewStart, resolveStartPlan } from "./start";
import type { ForuBrief } from "./types";

const foruBrief: ForuBrief = {
  age: 29,
  city: "上海",
  occupation: "产品经理",
  family: "和伴侣租房住",
  relationship: "dating",
  economy: "comfortable",
  health: "good",
  housing: "rent",
  situation: "公司在裁员，我在考虑要不要回老家发展。",
  focus: "想知道自己会不会后悔。",
};

function normalPlan() {
  return resolveStartPlan({ mode: "normal" }, { random: () => 0.42 });
}

describe("parseStartLifeRequest", () => {
  it("defaults to a normal life with unspecified gender", () => {
    expect(parseStartLifeRequest({})).toEqual({
      ok: true,
      gender: "unspecified",
      selection: { mode: "normal" },
    });
  });

  it("parses theme and script selections and resolves them against the catalog", () => {
    expect(parseStartLifeRequest({ gender: "female", mode: "theme", theme: "family" })).toMatchObject({
      ok: true,
      gender: "female",
      selection: { mode: "theme", theme: "family" },
    });
    expect(parseStartLifeRequest({ gender: "male", mode: "script", scriptId: "1990s-plant-seal" })).toMatchObject({
      ok: true,
      selection: { mode: "script", scriptId: "1990s-plant-seal" },
    });
  });

  it("rejects invalid modes, themes and script ids", () => {
    expect(parseStartLifeRequest({ mode: "theme", theme: "friendship" }).ok).toBe(false);
    expect(parseStartLifeRequest({ mode: "script", scriptId: "unknown" }).ok).toBe(false);
    expect(parseStartLifeRequest({ mode: "unknown" }).ok).toBe(false);
    expect(parseStartLifeRequest({ gender: "robot" }).ok).toBe(false);
  });

  it("accepts a valid ForU brief and rejects an underage or empty one", () => {
    expect(parseStartLifeRequest({ mode: "foru", brief: foruBrief })).toMatchObject({
      ok: true,
      selection: { mode: "foru", brief: { age: 29 } },
    });
    expect(parseStartLifeRequest({ mode: "foru", brief: { ...foruBrief, age: 15 } }).ok).toBe(false);
    expect(parseStartLifeRequest({ mode: "foru", brief: { ...foruBrief, situation: "" } }).ok).toBe(false);
  });
});

describe("previewStart", () => {
  it("shows the correct mode and age before the model responds", () => {
    expect(previewStart({ mode: "theme", theme: "career" })).toMatchObject({
      scenario: { mode: "theme", theme: "career" },
      age: 0,
    });
    expect(previewStart({ mode: "script", scriptId: "1990s-southbound-train" })).toMatchObject({
      scenario: { mode: "script", title: "南下的第 37 小时" },
      age: 20,
      city: "深圳",
    });
    expect(previewStart({ mode: "foru", brief: foruBrief })).toMatchObject({
      scenario: { mode: "foru" },
      age: 29,
      city: "上海",
    });
  });
});

describe("resolveStartPlan", () => {
  it("rolls a background only for normal/theme lives", () => {
    const normal = normalPlan();
    expect(normal.startAge).toBe(0);
    expect(normal.openingAtCurrentAge).toBe(false);
    expect(normal.background).toBeTruthy();

    const theme = resolveStartPlan({ mode: "theme", theme: "love" }, { random: () => 0.1 });
    expect(theme.scenario).toEqual({ mode: "theme", theme: "love" });
    expect(theme.background).toBeTruthy();
  });

  it("uses script and ForU starting ages without a random background", () => {
    const script = resolveStartPlan({ mode: "script", scriptId: "1980s-factory-succession" });
    expect(script.startAge).toBe(18);
    expect(script.openingAtCurrentAge).toBe(true);
    expect(script.background).toBeUndefined();
    expect(script.scenario).toMatchObject({ mode: "script", title: "顶替" });

    const foru = resolveStartPlan({ mode: "foru", brief: foruBrief });
    expect(foru.startAge).toBe(29);
    expect(foru.openingAtCurrentAge).toBe(true);
    expect(foru.scenario).toMatchObject({ mode: "foru", brief: { age: 29 } });
    expect(foru.background).toBeUndefined();
  });
});

describe("createStartLife", () => {
  const gender = "female" as const;

  it("keeps normal lives at age 0 with background finance and cross-life avoidance", () => {
    const plan = normalPlan();
    const state = createStartLife(plan, gender, { recentStorylines: ["sports", "arts"] });
    expect(state.basic.age).toBe(0);
    expect(state.scenario).toEqual({ mode: "normal" });
    expect(state.flags.avoidStorylines).toBe("sports,arts");
    expect(state.finance.cash).toBeGreaterThan(0);
    expect(state.flags.bgEconomy).toBe(plan.background?.economy);
    expect(state.flags.bgStructure).toBe(plan.background?.structure);
  });

  it("does not apply cross-life storyline avoidance to theme lives", () => {
    const plan = resolveStartPlan({ mode: "theme", theme: "career" }, { random: () => 0.2 });
    const state = createStartLife(plan, gender, { recentStorylines: ["sports"] });
    expect(state.scenario).toEqual({ mode: "theme", theme: "career" });
    expect(state.flags.avoidStorylines).toBeUndefined();
  });

  it("seeds a script life from the script starting state", () => {
    const plan = resolveStartPlan({ mode: "script", scriptId: "1980s-factory-succession" });
    const state = createStartLife(plan, gender);
    expect(state.basic.age).toBe(18);
    expect(state.basic.city).toBe("沈阳");
    expect(state.career.occupation).toBe("待业青年");
    expect(state.finance.cash).toBe(120);
    expect(state.relationships.partner.status).toBe("单身");
    expect(state.scenario).toMatchObject({ mode: "script", title: "顶替", startAge: 18 });
  });

  it("seeds a ForU life from the player's current situation", () => {
    const plan = resolveStartPlan({ mode: "foru", brief: foruBrief });
    const state = createStartLife(plan, gender);
    expect(state.basic.age).toBe(29);
    expect(state.basic.city).toBe("上海");
    expect(state.career.occupation).toBe("产品经理");
    expect(state.career.incomeYearly).toBe(250000);
    expect(state.finance.cash).toBe(150000);
    expect(state.finance.housing).toBe("租住");
    expect(state.finance.debt).toBe(0);
    expect(state.relationships.partner.status).toBe("恋爱中");
    expect(state.health.physical).toBe(88);
    expect(state.scenario).toMatchObject({ mode: "foru", brief: { age: 29 } });
  });

  it("falls back to the starter city when ForU leaves city blank", () => {
    const plan = resolveStartPlan({ mode: "foru", brief: { ...foruBrief, city: "" } });
    const state = createStartLife(plan, gender);
    expect(state.basic.city.length).toBeGreaterThan(0);
    expect(state.scenario).toMatchObject({ mode: "foru" });
  });
});

describe("zero-time opening", () => {
  it("keeps the current age only when allowZeroTime is explicit", () => {
    const state = createStarterLife({ age: 29 });
    const opening: NextEvent = {
      timePassed: 0,
      story: "你29岁，坐在会议室里。",
      event: { type: "career", title: "会议", importance: 0.8 },
      choices: [{ id: "A", text: "留下" }, { id: "B", text: "离开" }],
      objectiveChanges: {},
    };
    const opened = applyNextEvent(state, opening, undefined, { rollDeath: false, allowZeroTime: true });
    expect(opened.basic.age).toBe(29);
    expect(opened.history.at(-1)?.age).toBe(29);

    const advanced = applyNextEvent(state, opening, undefined, { rollDeath: false });
    expect(advanced.basic.age).toBe(30);
  });
});
