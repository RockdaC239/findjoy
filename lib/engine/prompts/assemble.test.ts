import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../prompt-baseline.json";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./assemble";
it("preserves the existing childhood and adult prompts byte for byte", () => {
  expect([buildSystemPrompt(false), buildSystemPrompt(true), ENDING_SYSTEM_PROMPT].map(prompt => createHash("sha256").update(prompt).digest("hex"))).toEqual(baseline);
  expect(ENDING_SYSTEM_PROMPT).toContain('"highlights"');
});
