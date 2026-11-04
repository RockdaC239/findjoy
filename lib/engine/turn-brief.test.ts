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
