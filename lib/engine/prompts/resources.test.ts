import { expect, it } from "vitest";
import { renderPrompt } from "./template";
import { OUTPUT_EXAMPLES } from "../output-format";
import { normalizeGeneratedEvent, normalizeEnding } from "../event-contract";
import { SCRIPTS, SCRIPT_ERAS, THEMES } from "../../modes/catalog";
import { scriptToScenario } from "../../modes/scenario";

it("substitutes literal data once and rejects missing template variables", () => {
  expect(renderPrompt("{{data}} / {{age}} / {{data}}", { data: "{{age}} $&", age: 15 }))
    .toBe("{{age}} $& / 15 / {{age}} $&");
  expect(() => renderPrompt("{{absent}}", {})).toThrow("absent");
  expect(() => renderPrompt("{{constructor}}", {})).toThrow("constructor");
});

it("keeps the external model examples valid under their output contracts", () => {
  for (const key of ["adultFormat", "adultExample", "twoSceneFormat"] as const) {
    expect(normalizeGeneratedEvent(OUTPUT_EXAMPLES[key]), key).not.toBeNull();
  }
  for (const key of ["childhoodFormat", "childhoodExample"] as const) {
    expect(normalizeGeneratedEvent(OUTPUT_EXAMPLES[key], false), key).not.toBeNull();
  }
  expect(normalizeEnding(OUTPUT_EXAMPLES.endingFormat)).not.toBeNull();
});

it("keeps external mode catalog references and event types usable", () => {
  const eventTypes = ["career", "relationship", "health", "finance", "random", "family"];
  expect(new Set(SCRIPTS.map(script => script.id)).size).toBe(SCRIPTS.length);
  for (const theme of THEMES) {
    expect(theme.eventTypes.length).toBeGreaterThan(0);
    expect(theme.eventTypes.every(type => eventTypes.includes(type))).toBe(true);
  }
  for (const script of SCRIPTS) {
    expect(SCRIPT_ERAS.some(era => era.id === script.eraId), script.id).toBe(true);
    const scenario = scriptToScenario(script);
    expect(scenario.directive).toContain(script.hook);
    expect(scenario.startAge).toBe(script.start.age);
  }
});
