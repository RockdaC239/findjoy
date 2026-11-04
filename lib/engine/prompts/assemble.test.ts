import { SCRIPTS } from "../../modes/catalog";
import { scriptToScenario } from "../../modes/scenario";
import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../prompt-baseline.json";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./assemble";
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
