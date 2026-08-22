import { describe, expect, it } from "vitest";
import { createStarterLife } from "./life";
import {
  buildStorylinePromptHint,
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
  });
});