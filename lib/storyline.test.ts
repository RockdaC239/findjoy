import { describe, expect, it } from "vitest";
import { createStarterLife } from "./life";
import {
  buildStorylinePromptHint,
  buildRecentSituationHint,
  detectStorylineDomains,
  extractLifeStorylines,
  leftStorylines,
  parseAvoidStorylines,
  storylineLabel,
} from "./storyline";

describe("storyline domain detection", () => {
  it("maps career terms to their domains", () => {
    expect(detectStorylineDomains(["运动员"])).toEqual(["sports"]);
    expect(detectStorylineDomains(["画家"])).toEqual(["arts"]);
    expect(detectStorylineDomains(["会计"])).toEqual(["finance"]);
    expect(detectStorylineDomains(["教师"])).toEqual(["education"]);
    expect(detectStorylineDomains(["程序员"])).toEqual(["tech"]);
    expect(detectStorylineDomains(["医生"])).toEqual(["medical"]);
    expect(detectStorylineDomains(["公务员"])).toEqual(["government"]);
    expect(detectStorylineDomains(["作家"])).toEqual(["media"]);
    expect(detectStorylineDomains(["司机"])).toEqual(["service"]);
    expect(detectStorylineDomains(["婴儿"])).toEqual([]);
    expect(detectStorylineDomains([])).toEqual([]);
  });

  it("detects multiple domains from one text", () => {
    expect(detectStorylineDomains(["体育老师"])).toEqual(["sports", "education"]);
  });

  it("ignores hobby-level mentions (踢球/画画 are not career signals)", () => {
    expect(detectStorylineDomains(["周末去踢球"])).toEqual([]);
    expect(detectStorylineDomains(["偶尔画画放松"])).toEqual([]);
  });

  it("labels domains in Chinese", () => {
    expect(storylineLabel("sports")).toBe("体育竞技");
    expect(storylineLabel("unknown")).toBe("unknown");
  });

  it("parses the persisted comma-joined avoid flag", () => {
    expect(parseAvoidStorylines("sports, arts")).toEqual(["sports", "arts"]);
    expect(parseAvoidStorylines("sports,bogus")).toEqual(["sports"]);
    expect(parseAvoidStorylines("")).toEqual([]);
    expect(parseAvoidStorylines(undefined)).toEqual([]);
  });
});

describe("life main storyline extraction", () => {
  it("extracts the dominant career domains of a life", () => {
    const state = createStarterLife({ age: 42 });
    state.career.occupation = "会计";
    state.history = [
      { id: "1", age: 18, type: "career", title: "进省队", story: "s", importance: 0.8, objectiveChanges: { occupation: "运动员" } },
      { id: "2", age: 25, type: "career", title: "转行", story: "s", importance: 0.7, objectiveChanges: { occupation: "会计" } },
      { id: "3", age: 35, type: "career", title: "升职", story: "s", importance: 0.6, objectiveChanges: { occupation: "财务主管" } },
    ] as never;
    expect(extractLifeStorylines(state)).toContain("finance");
    expect(extractLifeStorylines(state)).toContain("sports");
  });

  it("returns no storylines for a life that never had a career", () => {
    const state = createStarterLife({ age: 0 });
    expect(extractLifeStorylines(state)).toEqual([]);
  });
});

describe("left storylines (within-life anti-repetition)", () => {
  it("does not treat a childhood seed as left until a different career takes over", () => {
    const state = createStarterLife({ age: 18 });
    state.history = [
      { id: "1", age: 8, type: "career", title: "进入美术班", story: "s", importance: 0.7, objectiveChanges: {} },
    ] as never;
    expect(leftStorylines(state)).not.toContain("arts");
  });

  it("marks a domain as left once a different career follows it", () => {
    const state = createStarterLife({ age: 30 });
    state.career.occupation = "会计";
    state.history = [
      { id: "1", age: 20, type: "career", title: "成为画家", story: "s", importance: 0.8, objectiveChanges: { occupation: "画家" } },
    ] as never;
    expect(leftStorylines(state)).toContain("arts");
    expect(leftStorylines(state)).not.toContain("finance");
  });

  it("never marks the current occupation domain as left", () => {
    const state = createStarterLife({ age: 40 });
    state.career.occupation = "财务总监";
    state.history = [
      { id: "1", age: 25, type: "career", title: "入职", story: "s", importance: 0.7, objectiveChanges: { occupation: "会计" } },
    ] as never;
    expect(leftStorylines(state)).not.toContain("finance");
  });

  it("builds prompt hints only when guards are present", () => {
    expect(buildStorylinePromptHint()).toBe("");
    expect(buildStorylinePromptHint({})).toBe("");
    const hint = buildStorylinePromptHint({ avoidStorylines: ["sports"], leftStorylines: ["arts"] });
    expect(hint).toContain("【跨人生防重】");
    expect(hint).toContain("体育竞技");
    expect(hint).toContain("【单局内防重】");
    expect(hint).toContain("艺术创作");
    expect(hint).toContain("玩家明确选择");
    expect(hint).toContain("相同职业");
  });
});

it("reminds the writer of recent situations without inventing a semantic repetition verdict", () => {
  const state = createStarterLife();
  state.history = Array.from({ length: 6 }, (_, i) => ({ id: `e${i}`, age: i + 20, type: "career", title: `取舍${i}`, story: "s", importance: 0.6, choiceText: `行动${i}` })) as typeof state.history;
  const hint = buildRecentSituationHint(state);
  expect(hint).not.toContain("取舍0");
  expect(hint).toContain("取舍2");
  expect(hint).toContain("行动5");
  expect(hint).toContain("只换职业");
  expect(buildRecentSituationHint(createStarterLife())).toBe("");
});

describe("career facts versus narrative mentions", () => {
  it("recognises the repair, manufacturing and construction domains that used to fall through", () => {
    expect(detectStorylineDomains(["汽修厂技师"])).toContain("repair");
    expect(detectStorylineDomains(["机械维修工"])).toContain("repair");
    expect(detectStorylineDomains(["建筑绘图员"])).toContain("construction");
    expect(detectStorylineDomains(["规划院助理规划师"])).toContain("construction");
    expect(detectStorylineDomains(["工程造价员"])).toContain("construction");
    expect(detectStorylineDomains(["软件工程师"])).toEqual(["tech"]);
    expect(detectStorylineDomains(["中职学生"])).toEqual([]);
  });

  it("does not infer the protagonist's career from titles about other people", () => {
    const state = createStarterLife({ age: 26 });
    state.career.occupation = "规划院助理规划师";
    state.history = [
      { id: "1", age: 18, type: "career", title: "老师问你去不去云南调研", story: "s", importance: 0.7, objectiveChanges: {} },
      { id: "2", age: 24, type: "career", title: "周师傅邀你周末去测绘公司兼职", story: "s", importance: 0.6, objectiveChanges: { occupation: "规划院助理规划师" } },
    ] as never;
    expect(extractLifeStorylines(state)).toContain("construction");
    expect(extractLifeStorylines(state)).not.toContain("education");
  });

  it("does not count an unaccepted job or a hobby as an established career", () => {
    const state = createStarterLife({ age: 15 });
    state.history = [
      { id: "1", age: 15, type: "career", title: "老板问你要不要去汽修厂当学徒", story: "s", importance: 0.6, objectiveChanges: {} },
      { id: "2", age: 15, type: "relationship", title: "周末去踢球", story: "s", importance: 0.5, objectiveChanges: {} },
    ] as never;
    expect(extractLifeStorylines(state)).toEqual([]);
  });

  it("keeps historical career domains after the protagonist retires", () => {
    const state = createStarterLife({ age: 81 });
    state.career.occupation = "退休";
    state.history = [
      { id: "1", age: 23, type: "career", title: "毕业前两条路摆上桌", story: "s", importance: 0.7, objectiveChanges: { occupation: "汽修厂技师" } },
    ] as never;
    expect(extractLifeStorylines(state)).toEqual(["repair"]);
  });

  it("still lets a teacher's own life count as education", () => {
    const state = createStarterLife({ age: 35 });
    state.career.occupation = "小学教师";
    expect(extractLifeStorylines(state)).toEqual(["education"]);
  });
});

it("recognises public safety occupations without expanding every job title", () => {
  expect(detectStorylineDomains(["消防救援人员"])).toContain("government");
  expect(detectStorylineDomains(["消防员"])).toContain("government");
});
