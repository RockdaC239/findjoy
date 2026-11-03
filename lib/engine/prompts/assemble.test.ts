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
