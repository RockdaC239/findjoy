import { describe, expect, it } from "vitest";
import {
  backgroundToFinance,
  backgroundToFlags,
  buildBackgroundDirective,
  FAMILY_ECONOMY,
  FAMILY_STRUCTURE,
  flagsToBackground,
  OPENING_EVENT_GENRES,
  rollBackground,
  TALENTS,
} from "./background";

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("life background", () => {
  it("rolls valid values for all four dimensions", () => {
    for (let i = 0; i < 50; i++) {
      const background = rollBackground(seededRandom(i));
      expect(FAMILY_ECONOMY).toContain(background.economy);
      expect(FAMILY_STRUCTURE).toContain(background.structure);
      expect(OPENING_EVENT_GENRES).toContain(background.event);
      expect(TALENTS).toContain(background.talent);
    }
  });

  it("spreads across all economy levels and keeps 家庭变故 from dominating", () => {
    const economyCounts = new Map<string, number>();
    const eventCounts = new Map<string, number>();
    const total = 2000;
    for (let i = 0; i < total; i++) {
      const background = rollBackground(seededRandom(i));
      economyCounts.set(background.economy, (economyCounts.get(background.economy) ?? 0) + 1);
      eventCounts.set(background.event, (eventCounts.get(background.event) ?? 0) + 1);
    }
    for (const economy of FAMILY_ECONOMY) {
      expect(economyCounts.get(economy) ?? 0).toBeGreaterThan(0);
    }
    const upheavalShare = (eventCounts.get("家庭变故") ?? 0) / total;
    expect(upheavalShare).toBeGreaterThan(0.1);
    expect(upheavalShare).toBeLessThan(0.5);
    // 普通/小康 应为主流经济底色
    const ordinaryShare = ((economyCounts.get("普通") ?? 0) + (economyCounts.get("小康") ?? 0)) / total;
    expect(ordinaryShare).toBeGreaterThan(0.5);
  });

  it("maps economy to initial finance consistently", () => {
    expect(backgroundToFinance({ economy: "拮据" })).toEqual({ cash: 2000, assets: 2000, debt: 20000 });
    expect(backgroundToFinance({ economy: "普通" })).toEqual({ cash: 8000, assets: 8000, debt: 0 });
    expect(backgroundToFinance({ economy: "小康" }).cash).toBeGreaterThan(backgroundToFinance({ economy: "普通" }).cash);
    expect(backgroundToFinance({ economy: "大富" }).cash).toBeGreaterThan(1000000);
    expect(backgroundToFinance({ economy: "大富" }).debt).toBe(0);
  });

  it("round-trips through flags and rejects invalid values", () => {
    const background = rollBackground(seededRandom(7));
    expect(flagsToBackground(backgroundToFlags(background))).toEqual(background);
    expect(flagsToBackground({})).toBeUndefined();
    expect(flagsToBackground({ bgEconomy: "暴富", bgStructure: "双亲完整", bgEvent: "安稳温暖", bgTalent: "无" })).toBeUndefined();
  });

  it("avoids recently-used values so consecutive lives differ", () => {
    // 连续多局都用了 艺术天赋 + 再婚家庭，新一局应尽量避开，给玩家换一种人生。
    let sawOtherTalent = false;
    let sawOtherStructure = false;
    for (let i = 0; i < 500; i++) {
      const bg = rollBackground(seededRandom(i), { talent: ["艺术"], structure: ["再婚家庭"] });
      if (bg.talent !== "艺术") sawOtherTalent = true;
      if (bg.structure !== "再婚家庭") sawOtherStructure = true;
    }
    expect(sawOtherTalent).toBe(true);
    expect(sawOtherStructure).toBe(true);
  });

  it("rolls a valid fallback when every value of a dimension is avoided", () => {
    // 某维度全部被避开时回落到完整池，仍返回合法取值。
    for (let i = 0; i < 50; i++) {
      const bg = rollBackground(seededRandom(i), { talent: [...TALENTS], structure: [...FAMILY_STRUCTURE] });
      expect(TALENTS).toContain(bg.talent);
      expect(FAMILY_STRUCTURE).toContain(bg.structure);
    }
  });

  it("builds a directive that covers all four dimensions", () => {
    const directive = buildBackgroundDirective({ economy: "富裕", structure: "再婚家庭", event: "平凡开端", talent: "运动" });
    expect(directive).toContain("【本局出身档案】");
    expect(directive).toContain("家庭经济：富裕");
    expect(directive).toContain("家庭结构：再婚家庭");
    expect(directive).toContain("开局事件基调：平凡开端");
    expect(directive).toContain("天赋：运动");
  });
});
