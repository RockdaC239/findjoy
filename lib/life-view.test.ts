import { describe, expect, it } from "vitest";
import { buildLifeView } from "./life-view";
import type { LifeState } from "./life";

function baseState(): LifeState {
  return {
    lifeId: "life-1",
    basic: { age: 30, gender: "female", city: "上海", education: "本科" },
    career: { occupation: "设计师", companyType: "公司", incomeYearly: 120000, careerStage: "career" },
    finance: { cash: 10000, assets: 50000, debt: 0, housing: "租住" },
    health: { physical: 80, conditions: [], lifestyle: "普通" },
    relationships: { partner: { status: "稳定交往", years: 2 }, children: [], parents: { status: "健在" }, friends: [] },
    psychology: { valueProfile: {}, behaviorPatterns: [], internalConflicts: [] },
    history: [],
    majorMemories: [],
    flags: {},
    dead: false,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildLifeView", () => {
  it("restores the last decision node as the current event", () => {
    const state = baseState();
    state.history.push({
      id: "n1", age: 30, type: "career", title: "外派机会", story: "你在会议室里听到外派的消息。",
      choices: [{ id: "A", text: "接受外派" }, { id: "B", text: "留在总部" }],
      importance: 0.7,
    });
    const view = buildLifeView(state);
    expect(view.lifeId).toBe("life-1");
    expect(view.age).toBe(30);
    expect(view.city).toBe("上海");
    expect(view.eventTitle).toBe("外派机会");
    expect(view.story).toBe("你在会议室里听到外派的消息。");
    expect(view.choices).toEqual([{ id: "A", text: "接受外派" }, { id: "B", text: "留在总部" }]);
    expect(view.occupation).toBe("设计师");
    expect(view.dead).toBe(false);
  });

  it("restores a childhood narrative node with no choices", () => {
    const state = baseState();
    state.basic.age = 8;
    state.history.push({ id: "n1", age: 8, type: "family", title: "搬家", story: "这一年你们搬去了城东。", choices: [], importance: 0.6 });
    const view = buildLifeView(state);
    expect(view.age).toBe(8);
    expect(view.eventTitle).toBe("搬家");
    expect(view.choices).toEqual([]);
  });

  it("returns an empty view for a missing state", () => {
    expect(buildLifeView(null)).toMatchObject({ lifeId: "", age: 0 });
    expect(buildLifeView(undefined)).toMatchObject({ lifeId: "" });
  });

  it("reflects whether the life is finished", () => {
    const state = baseState();
    state.dead = true;
    expect(buildLifeView(state).dead).toBe(true);
  });
});
