import { describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { previewMessages } from "./preview";

describe("synthetic prompt preview", () => {
  it("is deterministic for every mode and generation stage", () => {
    for (const mode of ["normal", "theme", "script", "foru"] as const) {
      for (const stage of ["opening", "next", "ending"] as const) {
        const options = { mode, stage, theme: "love" as const, legacy: false };
        expect(previewMessages(options)).toEqual(previewMessages(options));
        expect(previewMessages(options)[0].role).toBe("system");
        expect(previewMessages(options).at(-1)?.role).toBe("user");
      }
    }
  });
  it("previews next-turn transcript and legacy history separately", () => {
    const options = { mode: "normal" as const, stage: "next" as const, theme: "love" as const, legacy: false };
    expect(previewMessages(options).map(message => message.role)).toEqual(["system", "user", "assistant", "user"]);
    const legacy = previewMessages({ ...options, legacy: true });
    expect(legacy).toHaveLength(2);
    expect(JSON.parse(legacy[1].content).history).toHaveLength(1);
  });
  it("prints machine-readable messages and rejects invalid CLI inputs", () => {
    const command = ["node_modules/vite-node/vite-node.mjs", "scripts/preview-prompts.ts"];
    const output = execFileSync(process.execPath, [...command, "--mode", "foru", "--json"], { encoding: "utf8" });
    expect(JSON.parse(output)).toEqual(previewMessages({ mode: "foru", stage: "opening", theme: "love", legacy: false }));
    const invalid = spawnSync(process.execPath, [...command, "--mode", "unknown"], { encoding: "utf8" });
    expect(invalid.status).toBe(1);
    expect(invalid.stdout).toBe("");
  });
  it("can inspect the legacy protocol independently of transcript storage", () => {
    const command = ["node_modules/vite-node/vite-node.mjs", "scripts/preview-prompts.ts"];
    const output = execFileSync(process.execPath, [...command, "--experience-version", "2", "--json"], { encoding: "utf8" });
    expect(JSON.parse(output)).toEqual(previewMessages({ mode: "normal", stage: "opening", theme: "love", legacy: false, experienceVersion: 2 }));
    const invalid = spawnSync(process.execPath, [...command, "--experience-version", "4"], { encoding: "utf8" });
    expect(invalid.status).toBe(1);
  });
});
