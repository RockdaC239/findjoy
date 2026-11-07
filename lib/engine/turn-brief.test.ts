import { describe, expect, it } from "vitest";
import { createStarterLife, type LifeEvent } from "../life";
import { buildModelPrompt, buildTranscriptUserContent } from "./context";

const event = (index: number): LifeEvent => ({ id: `e${index}`, age: 20 + index, type: "career", title: `工作${index}`, story: "师傅请你留下。", importance: 0.7, choices: [{ id: "A", text: "留下谈清分工" }, { id: "B", text: "去培训并交接" }], ...(index < 7 ? { choiceId: "A", choiceText: "留下谈清分工" } : {}) });

describe("turn writing task", () => {
  it("anchors both legacy and transcript requests to the chosen action without treating alternatives as facts", () => {
    const state = createStarterLife({ age: 27 });
    state.history = Array.from({ length: 8 }, (_, i) => event(i));
    const original = structuredClone(state);
    const choice = { id: "B", text: "去培训并交接" };
    for (const content of [buildModelPrompt(state, choice), buildTranscriptUserContent(state, choice)]) {
      const task = JSON.parse(content).turn_task;
      expect(task.respond_to).toEqual({ eventId: "e7", action: choice.text });
      expect(task.recent_decisions).toHaveLength(4);
      expect(task.recent_decisions.at(-1)).toEqual({ eventId: "e6", age: 26, situation: "工作6", action: "留下谈清分工" });
      expect(task.recent_decisions.some((item: { eventId: string }) => item.eventId === "e7")).toBe(false);
      expect(task.priority).toContain("回应");
    }
    expect(state).toEqual(original);
  });
  it("does not invent a choice in childhood or an empty opening", () => {
    const state = createStarterLife();
    const task = JSON.parse(buildTranscriptUserContent(state)).turn_task;
    expect(task.respond_to).toBeNull();
    expect(task.recent_decisions).toEqual([]);
  });
});

it("carries active narrative and recent situations through both context paths", () => {
  const state = createStarterLife({ age: 25 });
  state.history = [event(0)];
  state.narrative = { version: 1, people: [], threads: [{ id: "repair", content: "等待维修结果", status: "open", sourceEventId: "e0" }] };
  for (const content of [buildModelPrompt(state), buildTranscriptUserContent(state)]) {
    const request = JSON.parse(content);
    expect(request.narrative).toEqual(state.narrative);
    expect(request.turn_task.recent_situations).toContain("工作0");
    expect(request.turn_task.recent_situations).toContain("先回应已选行动");
  }
});

it("flags stale childhood facts in adult turns without prescribing a career", () => {
 const state=createStarterLife({age:33});
 const task=JSON.parse(buildTranscriptUserContent(state)).turn_task;
 expect(task.state_gaps).toContain("occupation");
 expect(task.state_gaps).toContain("education");
 expect(task.pacing).toContain("跨年");
});

it("exposes recent elapsed years in both request paths so pacing can escape annual turns", () => {
  const state = { ...createStarterLife({ age: 26 }), experienceVersion: 3 as const };
  state.basic.education = "大学在读（城乡规划）";
  state.career.occupation = "助理规划师";
  state.history = Array.from({ length: 7 }, (_, index) => event(index));
  for (const content of [buildModelPrompt(state), buildTranscriptUserContent(state)]) {
    const task = JSON.parse(content).turn_task;
    expect(task.recent_progress).toEqual([
      { age: 23, yearsPassed: 1, type: "career", title: "工作3" },
      { age: 24, yearsPassed: 1, type: "career", title: "工作4" },
      { age: 25, yearsPassed: 1, type: "career", title: "工作5" },
      { age: 26, yearsPassed: 1, type: "career", title: "工作6" },
    ]);
    expect(task.state_gaps).toContain("careerStage");
    expect(task.state_gaps).toContain("companyType");
  }
});

it("distinguishes same-age results, multiyear transitions and an unknown opening interval", () => {
  const state = createStarterLife({ age: 25 });
  state.history = [event(0), { ...event(1), age: 20 }, { ...event(2), age: 25 }];
  const task = JSON.parse(buildTranscriptUserContent(state)).turn_task;
  expect(task.recent_progress.map((item: { yearsPassed: number | null }) => item.yearsPassed)).toEqual([null, 0, 5]);
});

it("requests a final scene whenever the endpoint is reachable within the next turn", () => {
  const state = { ...createStarterLife({ age: 76 }), experienceVersion: 3 as const, lifespan: 81 };
  state.history = [event(0)];
  const task = JSON.parse(buildTranscriptUserContent(state)).turn_task;
  expect(task.final_stage).toMatchObject({ last_year: 81 });
  expect(task.age_window).toMatchObject({ fromAge: 76, maxSceneAge: 81 });
});

it("asks ordinary lives to widen after a work loop while preserving trial follow-ups", () => {
  const state = { ...createStarterLife({ age: 35 }), experienceVersion: 3 as const };
  state.history = Array.from({ length: 6 }, (_, index) => event(index));
  expect(JSON.parse(buildTranscriptUserContent(state)).turn_task.breadth_needed).toBe(true);
  expect(JSON.parse(buildTranscriptUserContent(state, { id: "A", text: "先试一个月", requiresFollowUp: true })).turn_task.breadth_needed).toBe(false);
  state.scenario = { mode: "theme", theme: "career" };
  expect(JSON.parse(buildTranscriptUserContent(state)).turn_task.breadth_needed).toBe(false);
});

it("keeps snapshot facts unambiguous in full-history continuation requests", () => {
  const state = { ...createStarterLife({ age: 35 }), experienceVersion: 3 as const };
  state.history = [{ ...event(0), stateUpdate: { physical: 80, cashFlow: { received: 800, paid: 0 } }, objectiveChanges: { physical: -12, cash: 800, occupation: "工程师" } }];
  const history = JSON.parse(buildModelPrompt(state)).history;
  expect(history[0].stateUpdate.physical).toBe(80);
  expect(history[0].objectiveChanges).toEqual({ occupation: "工程师" });
  expect(state.history[0].objectiveChanges?.physical).toBe(-12);
});
