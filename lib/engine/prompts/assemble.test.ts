import { SCRIPTS } from "../../modes/catalog";
import { rollBirthProfile } from "../../birth/profile";
import { scriptToScenario } from "../../modes/scenario";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../prompt-baseline.json";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./assemble";

it("applies the childhood opening treatment only to new ordinary openings and their recovery", () => {
  const base = { experienceVersion: 3 as const, scenario: { mode: "normal" as const } };
  expect(buildSystemPrompt(true, { ...base, isOpening: true })).toContain("【童年开篇写法】");
  expect(buildSystemPrompt(true, { ...base, openingRecoveryAge: 5 })).toContain("【童年开篇写法】");
  expect(buildSystemPrompt(true, base)).not.toContain("【童年开篇写法】");
  expect(buildSystemPrompt(true, { scenario: base.scenario, isOpening: true })).not.toContain("【童年开篇写法】");
  expect(buildSystemPrompt(true, { ...base, scenario: scriptToScenario(SCRIPTS[0]), isOpening: true })).not.toContain("【童年开篇写法】");
});
it("matches the reviewed childhood, adult and ending prompt baseline", () => {
  expect([buildSystemPrompt(false), buildSystemPrompt(true), ENDING_SYSTEM_PROMPT].map(prompt => createHash("sha256").update(prompt).digest("hex"))).toEqual(baseline);
  expect(ENDING_SYSTEM_PROMPT).toContain('"highlights"');
});
it("keeps decision continuation separate from childhood opening and allows meaningful recurring questions", () => {
  const prompt = buildSystemPrompt(true, { avoidAxis: "安稳/冒险" });
  expect(prompt).not.toContain("timePassed 硬约束 4~7");
  expect(prompt).not.toContain("本轮选项的张力轴必须与它不同");
  expect(prompt).toContain("上一行动");
  expect(prompt).toContain("收获");
  expect(prompt).toContain("安稳/冒险");
});

it("anchors ordinary and theme lives in contemporary China without overriding authored eras", () => {
  for (const mode of ["normal", "theme"] as const) {
    const scenario = mode === "normal" ? { mode } : { mode, theme: "family" as const };
    for (const choices of [false, true]) {
      expect(buildSystemPrompt(choices, { scenario })).toContain("【当代生活背景】");
    }
  }
  expect(buildSystemPrompt(true, { scenario: scriptToScenario(SCRIPTS[0]) })).not.toContain("【当代生活背景】");
});

it("composes v3 from shared craft, event protocol and exactly one era context", () => {
  const normal = buildSystemPrompt(true, { experienceVersion: 3, scenario: { mode: "normal" } });
  expect(normal).toContain("【先说清楚】");
  expect(normal).toContain("narration必须非空");
  expect(normal.match(/【当代生活背景】/g)).toHaveLength(1);

  const script = buildSystemPrompt(true, { experienceVersion: 3, scenario: scriptToScenario(SCRIPTS[0]) });
  expect(script).toContain("【先说清楚】");
  expect(script).not.toContain("【当代生活背景】");
});

it("uses concrete birth facts instead of the generic family background once a birth profile exists", () => {
  const birth = rollBirthProfile(() => 0.5, { economy: "普通", structure: "收养" });
  const background = { economy: "普通" as const, structure: "收养" as const, event: "家庭变故" as const };
  const prompt = buildSystemPrompt(false, { birth, background, scenario: { mode: "normal" } });
  expect(prompt).toContain("【程序出生事实】");
  expect(prompt).toContain("【本局开局事件基调】");
  expect(prompt).not.toContain("【本局出身档案】");
  expect(prompt).not.toContain("孤儿院");
  expect(prompt).not.toContain("父母离异后有一方再婚");
  // 旧存档没有 BirthProfile 时仍沿用原来的出身档案，不能因新链路丢背景。
  expect(buildSystemPrompt(false, { background, scenario: { mode: "normal" } })).toContain("【本局出身档案】");
});
