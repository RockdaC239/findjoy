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
it("runs v3 opening, a choice-dependent adult response and terminal narration with choices owned by their source", () => {
  let state = createStarterLife();
  state.experienceVersion = 3;
  state = applyNextEvent(state, mockLifeEvent(state));
  expect(state.career.occupation).toBe("学生");
  expect(state.basic.education).toBe("初中在读");
  const firstChoice = state.history[0].choices![0];
  const response = mockLifeEvent(state, firstChoice);
  expect(response.outcome).toBe("continue");
  expect(response.timePassed).toBe(1);
  expect(response.narration).not.toBe(mockLifeEvent(state, state.history[0].choices![1]).narration);
  state = applyNextEvent(state, response, firstChoice);
  expect(state.basic.age).toBe(16);
  expect(state.history[0].choiceId).toBe(firstChoice.id);
  expect(state.history[1].choiceId).toBeUndefined();
  expect(state.history[1].choices).toHaveLength(2);
  const secondChoice = state.history[1].choices![1];
  state = applyNextEvent(state, mockLifeEvent(state, secondChoice), secondChoice);
  expect(state.basic.age).toBe(24);
  expect(state.dead).toBe(true);
  expect(state.history[1].choiceId).toBe(secondChoice.id);
  expect(state.history[2].choiceId).toBeUndefined();
  expect(state.history[2].story).toBe("");
  expect(state.history[2].narration).toBeTruthy();
});

it("keeps script and ForU supplied career and education in v3 mock opening", () => {
  for (const mode of ["script", "foru"] as const) {
    const state = createStarterLife({ age: 32, education: "本科毕业" });
    state.experienceVersion = 3;
    // 只需模式判定，完整情境资料由开局模块负责。
    state.scenario = { ...state.scenario!, mode } as typeof state.scenario;
    state.career.occupation = "教师";
    const next = applyNextEvent(state, mockLifeEvent(state));
    expect(next.basic.age).toBe(32);
    expect(next.basic.education).toBe("本科毕业");
    expect(next.career.occupation).toBe("教师");
  }
});
