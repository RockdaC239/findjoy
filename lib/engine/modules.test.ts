import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import baseline from "./prompt-baseline.json";
import { createStarterLife } from "../life";
import { buildSystemPrompt } from "./prompts/assemble";
import { prepareEventRequest, buildEndingMessages } from "./context";
import { normalizeGeneratedEvent, serializeTranscriptEvent } from "./event-contract";
import { readStreamedEvent } from "./stream-contract";
import { SCRIPTS } from "../modes/catalog";
import { scriptToScenario } from "../modes/scenario";

describe("engine module boundaries", () => {
  it("preserves the existing childhood and adult prompts byte for byte", () => {
    expect([false, true].map(choices => createHash("sha256").update(buildSystemPrompt(choices)).digest("hex"))).toEqual(baseline);
  });
  it("uses the same message assembly for every mode and retains legacy context", () => {
    const normal = createStarterLife();
    const scenarios = [normal.scenario!, { mode: "theme" as const, theme: "love" as const }, scriptToScenario(SCRIPTS[0]), { mode: "foru" as const, brief: { age: 32, city: "成都", occupation: "教师", family: "与家人同住", relationship: "single" as const, economy: "ordinary" as const, health: "good" as const, housing: "rent" as const, situation: "想换份工作", focus: "职业" } }];
    for (const scenario of scenarios) {
      const state = { ...normal, scenario };
      const request = prepareEventRequest(state, undefined, []);
      expect(request.scenario).toEqual(scenario);
      expect(request.messages.map(message => message.role)).toEqual(["system", "user"]);
      expect(JSON.parse(request.messages[1].content).life.scenario).toEqual(scenario);
      expect(request.openingAtCurrentAge).toBe(["script", "foru"].includes(scenario.mode));
      const legacy = prepareEventRequest(state, undefined, null);
      expect(JSON.parse(legacy.messages[1].content).history).toEqual([]);
      const transcript = [{ role: "user" as const, content: "previous state" }, { role: "assistant" as const, content: "previous event" }];
      expect(prepareEventRequest(state, undefined, transcript).messages.slice(1, 3)).toEqual(transcript);
    }
  });
  it("keeps wire output, persisted transcript and stream preview consistent", () => {
    const event = normalizeGeneratedEvent({ timePassed: 3, story: "你三十五岁，站在门口。", event: { type: "family", title: "家人的来信", importance: 0.8 }, choices: [{ id: "A", text: "回家" }, { id: "B", text: "留下" }], objectiveChanges: { cash: -100 } });
    expect(event).not.toBeNull();
    const wire = serializeTranscriptEvent(event!);
    expect(normalizeGeneratedEvent(JSON.parse(wire))).toEqual(event);
    expect(readStreamedEvent(wire)).toEqual({ timePassed: 3, story: event!.story, title: event!.event.title, choices: event!.choices });
  });
  it("uses actual state facts in ending messages", () => {
    const state = createStarterLife({ age: 72 });
    const messages = buildEndingMessages(state);
    expect(messages.map(message => message.role)).toEqual(["system", "user"]);
    expect(JSON.parse(messages[1].content).current_age).toBe(72);
    expect(prepareEventRequest(state, undefined, []).messages[1].content).toContain('"life"');
  });
});
