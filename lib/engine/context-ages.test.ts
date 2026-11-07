import { describe, expect, it } from "vitest";
import { applyNextEvent, type NextEvent } from "../life";
import { createStartLife, resolveStartPlan } from "../modes/start";
import { buildTranscriptUserContent } from "./context";

describe("program-maintained character ages in model context", () => {
  it("increments parents and siblings by the protagonist's age after time passes", () => {
    const state = createStartLife(resolveStartPlan({ mode: "normal" }, { random: () => 0.42 }), "female");
    const before = JSON.parse(buildTranscriptUserContent(state, undefined, true)).current_state.family_ages;
    expect(before.protagonistAge).toBe(0);
    expect(before.members.map((member: { currentAge: number }) => member.currentAge)).toEqual(
      state.birth!.parents.map(parent => parent.birthAge).concat(state.birth!.household.siblings),
    );

    const event: NextEvent = {
      timePassed: 3,
      story: "你三岁，家里换了窗。",
      event: { type: "family", title: "换窗", importance: 0.6 },
      choices: [],
      objectiveChanges: {},
    };
    const advanced = applyNextEvent(state, event);
    const after = JSON.parse(buildTranscriptUserContent(advanced, undefined, false)).current_state.family_ages;
    expect(after.protagonistAge).toBe(3);
    for (const [index, member] of after.members.entries()) {
      expect(member.currentAge).toBe(before.members[index].currentAge + 3);
    }
  });
});

it("projects family ages into each allowed landing age using current death status", () => {
  const state = createStartLife(resolveStartPlan({ mode: "normal" }, { random: () => 0.42 }), "female");
  state.basic.age = 67;
  state.lifespan = 81;
  state.birth!.parents[1].birthAge = 42;
  state.relationships.parents.motherStatus = "已故";
  state.history = [{ id: "past", age: 67, type: "family", title: "之后", story: "新的生活", importance: 0.7 }];
  const task = JSON.parse(buildTranscriptUserContent(state)).turn_task;
  expect(task.age_window).toMatchObject({ fromAge: 67, maxSceneAge: 75 });
  const at71 = task.family_by_scene_age.find((item: { protagonistAge: number }) => item.protagonistAge === 71);
  expect(at71.members.find((item: { role: string }) => item.role === "母亲")).toMatchObject({ currentAge: 113, status: "已故" });
  expect(at71.members.find((item: { role: string }) => item.role === "父亲").status).toBeUndefined();
});
