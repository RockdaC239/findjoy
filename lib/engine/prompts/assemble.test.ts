import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../prompt-baseline.json";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./assemble";
it("preserves the existing childhood and adult prompts byte for byte", () => {
  expect([false, true].map(choices => createHash("sha256").update(buildSystemPrompt(choices)).digest("hex"))).toEqual(baseline);
  expect(ENDING_SYSTEM_PROMPT).toContain('"highlights"');
});
