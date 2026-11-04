import { describe, expect, it } from "vitest";
import {
  backgroundToFinance,
  backgroundToFlags,
  buildBackgroundDirective,
  buildOpeningToneDirective,
  FAMILY_ECONOMY,
  FAMILY_STRUCTURE,
  flagsToBackground,
  OPENING_EVENT_GENRES,
  rollBackground,
  OPPORTUNITY_SETTINGS,
} from "./background";

function seededRandom(seed: number) {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

describe("life background", () => {
  it("rolls valid values for all three dimensions", () => {
    for (let i = 0; i < 50; i++) {
      const background = rollBackground(seededRandom(i));
      expect(FAMILY_ECONOMY).toContain(background.economy);
      expect(FAMILY_STRUCTURE).toContain(background.structure);
      expect(OPENING_EVENT_GENRES).toContain(background.event);
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
    // 旧存档遗留的 bgTalent 应被忽略，取值非法仍按原逻辑拒绝
    expect(flagsToBackground({ bgEconomy: "暴富", bgStructure: "双亲完整", bgEvent: "安稳温暖", bgTalent: "无" })).toBeUndefined();
    expect(flagsToBackground({ bgEconomy: "普通", bgStructure: "双亲完整", bgEvent: "安稳温暖", bgTalent: "艺术" })).toEqual({ economy: "普通", structure: "双亲完整", event: "安稳温暖" });
  });

  it("avoids recently-used values so consecutive lives differ", () => {
    // 连续多局都是 再婚家庭 + 家庭变故，新一局应尽量避开，给玩家换一种人生。
    let sawOtherStructure = false;
    let sawOtherEvent = false;
    for (let i = 0; i < 500; i++) {
      const bg = rollBackground(seededRandom(i), { structure: ["再婚家庭"], event: ["家庭变故"] });
      if (bg.structure !== "再婚家庭") sawOtherStructure = true;
      if (bg.event !== "家庭变故") sawOtherEvent = true;
    }
    expect(sawOtherStructure).toBe(true);
    expect(sawOtherEvent).toBe(true);
  });

  it("soft-avoids recent values without forcing the pool down to one option", () => {
    // 最近六局可能覆盖全部少数派；硬过滤会逼出单一结构，降权应保留基础分布。
    let majority = 0;
    const total = 2000;
    for (let i = 0; i < total; i++) {
      const bg = rollBackground(seededRandom(i), { structure: ["单亲", "再婚家庭", "留守隔代", "收养"] });
      if (bg.structure === "双亲完整") majority++;
    }
    expect(majority / total).toBeGreaterThan(0.6);
  });

  it("still returns valid values when every value of a dimension is avoided", () => {
    let majority = 0;
    const total = 2000;
    for (let i = 0; i < total; i++) {
      const bg = rollBackground(seededRandom(i), { structure: [...FAMILY_STRUCTURE], event: [...OPENING_EVENT_GENRES] });
      expect(FAMILY_STRUCTURE).toContain(bg.structure);
      expect(OPENING_EVENT_GENRES).toContain(bg.event);
      if (bg.structure === "双亲完整") majority++;
    }
    expect(majority / total).toBeGreaterThan(0.5);
  });

  it("lowers rich share in rural areas and raises it in cities", () => {
    const richShare = (settlement: "城区" | "乡村") => {
      let rich = 0;
      for (let i = 0; i < 5000; i++) {
        const bg = rollBackground(seededRandom(i), {}, { settlement, includeOpportunity: false });
        if (bg.economy === "富裕" || bg.economy === "大富") rich++;
      }
      return rich / 5000;
    };
    const urban = richShare("城区");
    const rural = richShare("乡村");
    expect(urban).toBeGreaterThan(rural);
    expect(urban).toBeGreaterThan(0.25);
    expect(rural).toBeLessThan(0.2);
  });

  it("builds a directive that covers all three dimensions and no talent", () => {
    const directive = buildBackgroundDirective({ economy: "富裕", structure: "再婚家庭", event: "平凡开端" });
    expect(directive).toContain("【本局出身档案】");
    expect(directive).toContain("家庭经济：富裕");
    expect(directive).toContain("家庭结构：再婚家庭");
    expect(directive).toContain("开局事件基调：平凡开端");
    expect(directive).not.toContain("天赋");
  });
});

 it("samples and persists opportunity environments without prescribing a career", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 500; i++) {
    const bg = rollBackground(seededRandom(i));
    expect(OPPORTUNITY_SETTINGS).toContain(bg.opportunity);
    expect(flagsToBackground(backgroundToFlags(bg))).toEqual(bg);
    seen.add(bg.opportunity!);
  }
  expect(seen.size).toBe(OPPORTUNITY_SETTINGS.length);
  const avoided = rollBackground(() => 0, { opportunity: [OPPORTUNITY_SETTINGS[0]] });
  expect(OPPORTUNITY_SETTINGS).toContain(avoided.opportunity);
  expect(buildBackgroundDirective(avoided)).toContain("不决定你的职业");
  let recentlyUsed = 0;
  let other = 0;
  for (let i = 0; i < 2000; i++) {
    const bg = rollBackground(seededRandom(i), { opportunity: [OPPORTUNITY_SETTINGS[0]] });
    if (bg.opportunity === OPPORTUNITY_SETTINGS[0]) recentlyUsed++;
    else other++;
  }
  expect(recentlyUsed).toBeLessThan(other);
});

it("can skip the legacy opportunity setting when birth facts already define the environment", () => {
  const background = rollBackground(() => 0.5, {}, { includeOpportunity: false });
  expect(background.opportunity).toBeUndefined();
  expect(FAMILY_ECONOMY).toContain(background.economy);
  expect(backgroundToFlags(background).bgOpportunity).toBeUndefined();
});

it("keeps only the opening tone when birth facts are present", () => {
  const directive = buildOpeningToneDirective({ economy: "大富", structure: "收养", event: "家庭变故", opportunity: OPPORTUNITY_SETTINGS[0] });
  expect(directive).toContain("【本局开局事件基调】");
  expect(directive).toContain("家庭变故");
  expect(directive).toContain("以【程序出生事实】为准");
  expect(directive).toContain("不把出生档案中的同住父母改写成离异");
  expect(directive).not.toContain("父母分开或亲人离去");
  expect(directive).not.toContain("【本局出身档案】");
  expect(directive).not.toContain("孤儿院");
  expect(directive).not.toContain(OPPORTUNITY_SETTINGS[0]);
  expect(directive).not.toContain("可接触的生活环境");
});
