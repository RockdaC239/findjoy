import { describe, expect, it } from "vitest";
import { createStarterLife } from "./life";
import { createStartLife, resolveStartPlan } from "./modes/start";
import { prepareEventRequest } from "./engine/context";
import {
  OPENING_DIMENSIONS,
  openingLabel,
  openingOptions,
  renderOpeningDirective,
  sampleOpeningPlan,
  validateOpeningPlan,
  type OpeningPlan,
} from "./opening-plan";

function mulberry32(seed: number): () => number {
  let current = seed >>> 0;
  return () => {
    current = (current + 0x6D2B79F5) >>> 0;
    let value = current;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

describe("opening plan catalog", () => {
  it("offers enough distinct directions per dimension", () => {
    expect(openingOptions("relationship").length).toBeGreaterThanOrEqual(8);
    expect(openingOptions("driver").length).toBeGreaterThanOrEqual(8);
    expect(openingOptions("mechanism").length).toBeGreaterThanOrEqual(10);
    expect(openingOptions("stakes").length).toBeGreaterThanOrEqual(6);
  });

  it("keeps 'discovery of talent' and 'family arrangement' off the default path", () => {
    const discovery = openingOptions("mechanism").find(option => option.id === "discovery");
    const heaviestMechanism = Math.max(...openingOptions("mechanism").map(option => option.weight));
    expect(discovery?.weight).toBeLessThan(heaviestMechanism);
    const arrangement = openingOptions("driver").find(option => option.id === "family-arrangement");
    const heaviestDriver = Math.max(...openingOptions("driver").map(option => option.weight));
    expect(arrangement?.weight).toBeLessThan(heaviestDriver);
  });
});

describe("opening plan sampling", () => {
  it("is reproducible for a fixed random source", () => {
    expect(sampleOpeningPlan(mulberry32(20261107), [])).toEqual(sampleOpeningPlan(mulberry32(20261107), []));
  });

  it("requires a valid [0,1) random source", () => {
    expect(() => sampleOpeningPlan(() => 1)).toThrow(RangeError);
  });

  it("lower the chance of repeating a recently used direction", () => {
    const sample = (recent: OpeningPlan[]) => {
      const random = mulberry32(77);
      const counts: Record<string, number> = {};
      for (let index = 0; index < 2000; index++) {
        const picked = sampleOpeningPlan(random, recent).mechanism;
        counts[picked] = (counts[picked] ?? 0) + 1;
      }
      return counts;
    };
    const baseline = sample([]);
    const recent: OpeningPlan = { version: 1, relationship: "caregiver", driver: "own-wish", mechanism: "discovery", stakes: "money" };
    const avoided = sample([recent]);
    // 近期用过的“发现特长”仍然可能出现，但占比要明显下降（不是硬排除，也不是原样）。
    expect(avoided.discovery ?? 0).toBeGreaterThan(0);
    expect(avoided.discovery / 2000).toBeLessThan((baseline.discovery / 2000) * 0.5);
  });

  it("records the recent combinations it consulted so the opening prompt can mention them", () => {
    const recent: OpeningPlan = { version: 1, relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" };
    const plan = sampleOpeningPlan(mulberry32(5), [recent]);
    expect(plan.recent).toEqual([{ relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" }]);
  });

  it("keeps the sampled ids inside the catalog", () => {
    const random = mulberry32(9);
    for (let index = 0; index < 200; index++) {
      const plan = sampleOpeningPlan(random, []);
      expect(validateOpeningPlan(plan)).toEqual(plan);
    }
  });
});

describe("opening plan validation", () => {
  const valid: OpeningPlan = { version: 1, relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" };

  it("accepts a catalog-backed plan and drops unknown ids", () => {
    expect(validateOpeningPlan(valid)).toEqual(valid);
    expect(validateOpeningPlan({ ...valid, mechanism: "not-in-catalog" })).toBeUndefined();
    expect(validateOpeningPlan({ ...valid, version: 2 })).toBeUndefined();
    expect(validateOpeningPlan(null)).toBeUndefined();
    expect(validateOpeningPlan({ ...valid, recent: [{ relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" }, { relationship: "peer", driver: "curiosity", mechanism: "bogus", stakes: "trust" }] })?.recent)
      .toEqual([{ relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" }]);
  });

  it("renders a directive that names the direction without writing the plot", () => {
    const text = renderOpeningDirective(valid);
    expect(text).toContain("本局开局的主要关系：");
    expect(text).toContain(openingLabel("mechanism", "secret"));
    expect(text).toContain("不是预写剧情");
    expect(text).toContain("师傅、学徒、旧工具");
    expect(text).toContain("不是一笔工资");
    expect(text).toContain("代价类型");
    expect(text).toContain("信任");
    expect(renderOpeningDirective(undefined)).toBe("");
    expect(renderOpeningDirective({ ...valid, mechanism: "bogus" })).toBe("");
  });

  it("mentions recent directions only when they exist", () => {
    expect(renderOpeningDirective(valid)).not.toContain("最近几局的开局组合是");
    const withRecent = renderOpeningDirective({ ...valid, recent: [{ relationship: "caregiver", driver: "own-wish", mechanism: "discovery", stakes: "money" }] });
    expect(withRecent).toContain("最近几局的开局组合是");
    expect(withRecent).toContain(openingLabel("mechanism", "discovery"));
  });
});

describe("opening plan lifecycle", () => {
  it("samples for normal lives only and stores the plan in the state", () => {
    const normal = resolveStartPlan({ mode: "normal" }, { random: mulberry32(11) });
    expect(OPENING_DIMENSIONS.every(dimension => typeof normal.openingPlan?.[dimension] === "string")).toBe(true);
    const state = createStartLife(normal, "female");
    expect(state.openingPlan).toEqual(normal.openingPlan);

    const theme = resolveStartPlan({ mode: "theme", theme: "career" }, { random: mulberry32(11) });
    expect(theme.openingPlan).toBeUndefined();
    expect(createStartLife(theme, "female").openingPlan).toBeUndefined();
  });

  it("does not sample for mock starts", () => {
    const plan = resolveStartPlan({ mode: "normal" }, { random: mulberry32(11), sampleOpening: false });
    expect(plan.openingPlan).toBeUndefined();
  });

  it("does not resample when the same plan is turned into a state twice", () => {
    const plan = resolveStartPlan({ mode: "normal" }, { random: mulberry32(11) });
    const first = createStartLife(plan, "female");
    const second = createStartLife(plan, "female");
    expect(first.openingPlan).toEqual(second.openingPlan);
  });

  it("passes recent directions into sampling", () => {
    const random = mulberry32(21);
    const first = resolveStartPlan({ mode: "normal" }, { random });
    const second = resolveStartPlan({ mode: "normal" }, { random, recentOpenings: [first.openingPlan!] });
    expect(second.openingPlan?.recent).toContainEqual({
      relationship: first.openingPlan!.relationship,
      driver: first.openingPlan!.driver,
      mechanism: first.openingPlan!.mechanism,
      stakes: first.openingPlan!.stakes,
    });
  });
});

describe("opening plan prompt injection", () => {
  it("appears at the opening turn of a normal life and disappears afterwards", () => {
    const plan: OpeningPlan = { version: 1, relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" };
    const state = { ...createStarterLife(), experienceVersion: 3 as const, openingPlan: plan };
    const opening = prepareEventRequest(state, undefined, []);
    expect(opening.messages[0].content).toContain("本局开局的主要关系：");

    const later = {
      ...state,
      basic: { ...state.basic, age: 16 },
      history: [{ id: "e1", age: 15, type: "family" as const, title: "一件小事", story: "s", importance: 0.5, choices: [{ id: "A", text: "走" }, { id: "B", text: "留" }], choiceId: "A", choiceText: "走" }],
    };
    expect(prepareEventRequest(later, { id: "A", text: "走" }, []).messages[0].content).not.toContain("本局开局的主要关系：");
  });

  it("never leaks into theme, script or ForU lives even if a plan field exists", () => {
    const plan: OpeningPlan = { version: 1, relationship: "peer", driver: "curiosity", mechanism: "secret", stakes: "trust" };
    const base = createStarterLife();
    const scenarios = [
      { mode: "theme" as const, theme: "love" as const },
      { mode: "script" as const, scriptId: "1980s-factory-succession", eraId: "1980s", eraLabel: "1980年代", eraYears: "1980-1989", title: "顶替", tagline: "t", premise: "p", hook: "h", coreConflict: "c", tone: "tone", eventType: "career" as const, start: { age: 18, city: "沈阳", occupation: "待业青年" }, startAge: 18, directive: "d" },
      { mode: "foru" as const, brief: { age: 32, city: "成都", occupation: "教师", family: "与家人同住", relationship: "single" as const, economy: "ordinary" as const, health: "good" as const, housing: "rent" as const, situation: "想换份工作", focus: "职业" } },
    ];
    for (const scenario of scenarios) {
      const state = { ...base, experienceVersion: 3 as const, openingPlan: plan, scenario };
      expect(prepareEventRequest(state, undefined, []).messages[0].content).not.toContain("本局开局的主要关系：");
    }
  });

  it("keeps old saves without a plan working", () => {
    const state = { ...createStarterLife(), experienceVersion: 3 as const };
    const opening = prepareEventRequest(state, undefined, []);
    expect(opening.messages[0].content).not.toContain("本局开局的主要关系：");
    expect(opening.messages[0].content).toContain("【童年开篇写法】");
  });
});
