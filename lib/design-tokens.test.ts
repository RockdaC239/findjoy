import { expect, it } from "vitest";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

it("generates token aliases and detects stale CSS before it can drift from the source", () => {
  const shipped = spawnSync(process.execPath, [new URL("../scripts/generate-design-tokens.mjs", import.meta.url).pathname, "--check"], { encoding: "utf8" });
  expect(shipped.status, shipped.stderr).toBe(0);
  const root = mkdtempSync(join(tmpdir(), "findjoy-design-"));
  try {
    mkdirSync(join(root, "scripts"));
    mkdirSync(join(root, "design/tokens"), { recursive: true });
    const script = join(root, "scripts/generate-design-tokens.mjs");
    const source = join(root, "design/tokens/tokens.json");
    const output = join(root, "design/tokens/tokens.css");
    writeFileSync(script, readFileSync(new URL("../scripts/generate-design-tokens.mjs", import.meta.url)));
    const tokens = JSON.parse(readFileSync(new URL("../design/tokens/tokens.json", import.meta.url), "utf8"));
    writeFileSync(source, JSON.stringify(tokens));
    const run = (...args: string[]) => spawnSync(process.execPath, [script, ...args], { encoding: "utf8" });
    expect(run().status).toBe(0);
    expect(readFileSync(output, "utf8")).toContain("--orange: var(--fj-color-brand);");
    expect(run("--check").status).toBe(0);
    tokens.color.brand = "#123456";
    writeFileSync(source, JSON.stringify(tokens));
    expect(run("--check").status).toBe(1);
    expect(run().status).toBe(0);
    expect(readFileSync(output, "utf8")).toContain("--fj-color-brand: #123456;");
    expect(run("--check").status).toBe(0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
