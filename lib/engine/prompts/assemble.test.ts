import { expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "../prompt-baseline.json";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./assemble";
it("matches the reviewed childhood, adult and ending prompt baseline", () => {
  expect([buildSystemPrompt(false), buildSystemPrompt(true), ENDING_SYSTEM_PROMPT].map(prompt => createHash("sha256").update(prompt).digest("hex"))).toEqual(baseline);
  expect(ENDING_SYSTEM_PROMPT).toContain('"highlights"');
});
