import { describe, expect, it } from "vitest";
import { buildBirthDirective, rollBirthProfile } from "../../birth/profile";
import { buildBackgroundDirective } from "../../background";
import { createStarterLife } from "../../life";
import { buildRecentSituationHint } from "../../storyline";

describe("提示词数据插值边界", () => {
  it("出生和经历资料中的模板标记保持原样", () => {
    const profile = rollBirthProfile(() => 0.5, { economy: "普通", structure: "双亲完整" });
    profile.household.resources = "{{scene}} {{missing}}";
    expect(buildBirthDirective(profile)).toContain('"resources":"{{scene}} {{missing}}"');
    const state = createStarterLife();
    state.history.push({ id: "event", age: 1, title: "{{recent}} {{missing}}" } as never);
    expect(buildRecentSituationHint(state)).toContain('"situation":"{{recent}} {{missing}}"');
  });

  it("旧存档可选生活环境按原顺序追加", () => {
    const background = { economy: "普通", structure: "双亲完整", event: "平凡开端" } as const;
    const without = buildBackgroundDirective(background).split("\n");
    const withOpportunity = buildBackgroundDirective({ ...background, opportunity: "公共图书馆与普通学校" }).split("\n");
    expect(withOpportunity.slice(0, 3)).toEqual(without.slice(0, 3));
    expect(withOpportunity[3]).toContain("公共图书馆与普通学校");
    expect(withOpportunity[4]).toBe(without[3]);
  });
});
