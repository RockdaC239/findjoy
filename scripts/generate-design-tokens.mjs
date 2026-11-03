import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";

const source = new URL("../design/tokens/tokens.json", import.meta.url);
const target = new URL("../design/tokens/tokens.css", import.meta.url);
const tokens = JSON.parse(readFileSync(source, "utf8"));
function declarations(group, prefix = "fj") {
  return Object.entries(group).flatMap(([key, value]) => {
    assert.match(key, /^[a-z0-9-]+$/);
    const name = `${prefix}-${key}`;
    if (value && typeof value === "object") return declarations(value, name);
    assert.ok(typeof value === "string" || typeof value === "number", `${name} must be a CSS value`);
    return `  --${name}: ${value};`;
  });
}
const aliases = { paper: "background", ink: "text", muted: "text-muted", line: "border", orange: "brand", soft: "surface-muted" };
for (const color of Object.values(aliases)) assert.match(tokens.color[color], /^#[0-9a-f]{6}$/);
const output = [
  "/* Generated from tokens.json by npm run design:tokens; do not edit directly. */",
  ":root {",
  ...declarations(tokens),
  ...Object.entries(aliases).map(([name, color]) => `  --${name}: var(--fj-color-${color});`),
  "}", "",
].join("\n");
if (process.argv.includes("--check")) {
  assert.equal(readFileSync(target, "utf8"), output, "Token CSS is stale; run npm run design:tokens");
  console.log("Design tokens are in sync");
} else {
  writeFileSync(target, output);
  console.log("Generated design/tokens/tokens.css");
}
