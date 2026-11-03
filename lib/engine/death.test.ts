import { expect, it } from "vitest";
import { normalizeGeneratedEvent, repairGeneratedEvent, serializeTranscriptEvent } from "./event-contract";
import { applyNextEvent, createStarterLife } from "../life";

const death = { outcome: "death", timePassed: 3, deathCause: "accident", story: "你二十四岁，在一次意外中离开了这个世界。", event: { type: "random", title: "人生停在这里", importance: 1 }, choices: [], objectiveChanges: {} };
it("accepts an early death without choices or narrative rejudgment", () => {
  const event = normalizeGeneratedEvent(death, true, undefined, { avoidStorylines: ["tech"] });
  expect(event).toMatchObject({ outcome: "death", deathCause: "accident", choices: [] });
  const state = applyNextEvent(createStarterLife({ age: 21 }), event!);
  expect(state).toMatchObject({ dead: true, basic: { age: 24 }, flags: { deathCause: "accident" } });
  expect(state.history.at(-1)).toMatchObject({ outcome: "death", choices: [] });
  expect(JSON.parse(serializeTranscriptEvent(event!))).toMatchObject({ outcome: "death", deathCause: "accident" });
});
it("repairs death metadata locally and never fills death choices", () => {
  const event = repairGeneratedEvent({ ...death, deathCause: "unknown", choices: [{ id: "A", text: "继续" }] }, true);
  expect(event).toMatchObject({ outcome: "death", deathCause: "other", choices: [] });
});
it("does not invent a death for old or unhealthy continuing lives", () => {
  const state = createStarterLife({ age: 96 });
  state.health.physical = 0;
  const event = normalizeGeneratedEvent({ ...death, outcome: "continue", choices: [{ id: "A", text: "接受" }, { id: "B", text: "拒绝" }] })!;
  expect(applyNextEvent(state, event).dead).toBe(false);
});
it("reads old event payloads as continuing lives", () => {
  const { outcome: _outcome, deathCause: _cause, ...old } = death;
  void _outcome; void _cause;
  expect(normalizeGeneratedEvent({ ...old, choices: [] }, false)?.outcome).toBe("continue");
});
