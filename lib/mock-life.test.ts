import { expect, it } from "vitest";
import { applyNextEvent, createStarterLife } from "./life";
import { mockLifeEnding, mockLifeEvent } from "./mock-life";
import { readDeveloperMode } from "./developer-mode";
it("runs childhood, a real decision, and farewell in exactly three saved events", () => {
  let state = createStarterLife();
  state = applyNextEvent(state, mockLifeEvent(state));
  expect(state.basic.age).toBe(8); expect(state.dead).toBe(false); expect(state.history[0].choices).toEqual([]);
  state = applyNextEvent(state, mockLifeEvent(state));
  expect(state.basic.age).toBe(32); expect(state.history[1].choices).toHaveLength(3);
  const choice = state.history[1].choices![0];
  state = applyNextEvent(state, mockLifeEvent(state, choice), choice);
  expect(state).toMatchObject({ dead: true, basic: { age: 81 } });
  expect(state.history).toHaveLength(3); expect(state.history[1].choiceId).toBe("A");
  expect(mockLifeEnding(state)).toMatchObject({ age: 81, facts: { events: 3 } });
});
it("requires enabled dev mode before reading a mock preference", () => {
  expect(readDeveloperMode("findjoy_mock=1")).toEqual({ enabled: false, mock: false });
  expect(readDeveloperMode("findjoy_developer=1; findjoy_mock=1")).toEqual({ enabled: true, mock: true });
  expect(readDeveloperMode("findjoy_developer=1; findjoy_mock=0")).toEqual({ enabled: true, mock: false });
});
