import { describe, expect, it } from "vitest";
import { applyNextEvent, createStarterLife, type NextEvent } from "../life";
import { normalizeGeneratedEvent, serializeTranscriptEvent } from "./event-contract";
const wire = { timePassed: 2, story: "你二十二岁，回家照顾母亲。", event: { type: "family", title: "回家", importance: 0.8 }, choices: [{ id: "A", text: "留下" }, { id: "B", text: "请人协助" }], objectiveChanges: { city: "成都", education: "大专", fatherStatus: "已故", motherStatus: "健在", children: ["女儿"], friends: [], conditions: ["高血压"] }, narrative: { direction: { content: "照顾母亲", sourceEventId: "current" }, people: [{ id: "mother", relation: "母亲", want: "自己生活", sharedMemory: "一起回家", sourceEventId: "current" }], threads: [{ id: "care", content: "商量照护分工", status: "open", sourceEventId: "current" }] } };
describe("saved narrative continuity", () => {
  it("persists normalized facts and current-event provenance without mutating prior state", () => {
    const state = createStarterLife({ age: 20 });
    const original = structuredClone(state);
    const event = normalizeGeneratedEvent(wire)!;
    const next = applyNextEvent(state, event);
    expect(next.basic).toMatchObject({ age: 22, city: "成都", education: "大专" });
    expect(next.relationships.parents).toMatchObject({ fatherStatus: "已故", motherStatus: "健在", status: "父亲：已故；母亲：健在" });
    expect(next.relationships.children).toEqual(["女儿"]);
    expect(next.health.conditions).toEqual(["高血压"]);
    expect(next.narrative?.direction?.sourceEventId).toBe(next.history[0].id);
    expect(next.narrative?.threads[0].sourceEventId).toBe(next.history[0].id);
    expect(JSON.parse(serializeTranscriptEvent(event)).narrative).toEqual(event.narrative);
    expect(normalizeGeneratedEvent(JSON.parse(serializeTranscriptEvent(event)))).toEqual(event);
    expect(state).toEqual(original);
  });
  it("rejects invented provenance and removes closed threads while retaining other memories", () => {
    const first = applyNextEvent(createStarterLife(), normalizeGeneratedEvent(wire)!);
    const event = normalizeGeneratedEvent({ ...wire, objectiveChanges: {}, narrative: { direction: { content: "编造方向", sourceEventId: "fake" }, people: [{ id: "fake", relation: "朋友", want: "见面", sharedMemory: "不存在", sourceEventId: "fake" }], threads: [{ id: "care", content: "分工已商妥", status: "closed", sourceEventId: first.history[0].id }] } })!;
    const next = applyNextEvent(first, event);
    expect(next.narrative?.people.map(person => person.id)).toEqual(["mother"]);
    expect(next.narrative?.threads).toEqual([]);
    expect(next.narrative?.direction).toEqual(first.narrative?.direction);
    expect(next.history.at(-1)?.narrative?.people).toEqual([]);
    expect(next.history.at(-1)?.narrative?.direction).toBeUndefined();
  });
  it("drops malformed snapshots rather than clearing confirmed facts, and supports old events", () => {
    const parsed = normalizeGeneratedEvent({ ...wire, objectiveChanges: { children: [1], friends: "朋友", city: "x".repeat(300) }, narrative: { people: [{ id: "bad id" }], threads: [] } })!;
    const state = createStarterLife(); state.relationships.children = ["儿子"];
    const next = applyNextEvent(state, parsed);
    expect(next.relationships.children).toEqual(["儿子"]);
    expect(next.basic.city).toBe(state.basic.city);
    expect(next.narrative).toBeUndefined();
    const old: NextEvent = { timePassed: 1, story: "生活继续", event: { type: "random", title: "新年", importance: 0.5 }, choices: [], objectiveChanges: {} };
    expect(applyNextEvent(state, old).narrative).toBeUndefined();
  });
  it("caps active context while preserving earlier records in history", () => {
    let state = createStarterLife();
    for (let i = 0; i < 8; i++) {
      const next = normalizeGeneratedEvent({ ...wire, narrative: {
        people: [{ id: `p${i}`, relation: "同事", want: "合作", sharedMemory: "一起交接", sourceEventId: "current" }],
        threads: [{ id: `t${i}`, content: "等待交接", status: "open", sourceEventId: "current" }],
      } })!;
      state = applyNextEvent(state, next);
    }
    expect(state.narrative?.people.map(person => person.id)).toEqual(["p4", "p5", "p6", "p7"]);
    expect(state.narrative?.threads.map(thread => thread.id)).toEqual(["t5", "t6", "t7"]);
    expect(state.history[0].narrative?.people?.[0].id).toBe("p0");
    expect(state.history).toHaveLength(8);
  });

});

it("accepts provider career nesting without confusing absolute finances with deltas", () => {
 const event=normalizeGeneratedEvent({...wire,objectiveChanges:{career:{occupation:"社区前台",incomeYearly:60000},basic:{city:"北京",education:"教育经历未详"},finance:{cash:500000}}})!;
 const state=applyNextEvent(createStarterLife({age:33}),event);
 expect(state.career.occupation).toBe("社区前台");
 expect(state.career.incomeYearly).toBe(60000);
 expect(state.basic.education).toBe("教育经历未详");
 expect(state.finance.cash).toBe(8000);
});

it("removes deceased parents from active people and clears pending tasks at the life endpoint", async () => {
  const { createStarterLife, applyNextEvent } = await import("../life");
  const state = createStarterLife({ age: 67 });
  state.narrative = {
    version: 1,
    direction: { content: "安排手术", sourceEventId: "old" },
    people: [
      { id: "mother", relation: "母亲", want: "在家住", sharedMemory: "一起回家", sourceEventId: "old" },
      { id: "aide", relation: "照护阿姨", want: "继续照护", sharedMemory: "一起照护", sourceEventId: "old" },
    ],
    threads: [{ id: "operation", content: "下周答复手术", status: "open", sourceEventId: "old" }],
  };
  const event: NextEvent = { timePassed: 1, story: "之后的生活", event: { type: "family", title: "告别", importance: 0.8 }, choices: [], objectiveChanges: { motherStatus: "已故" } };
  const next = applyNextEvent(state, event);
  expect(next.narrative?.people.map(person => person.id)).toEqual(["aide"]);
  const terminal = applyNextEvent(next, { ...event, outcome: "death", story: "", narration: "你在熟悉的家中离世。" });
  expect(terminal.narrative?.threads).toEqual([]);
  expect(terminal.narrative?.people).toEqual([]);
  expect(terminal.narrative?.direction).toBeUndefined();
  expect(state.narrative.people).toHaveLength(2);
});

it.each(["因病去世", "已于去年去世", "已故（去年）"])("recognizes descriptive parent death status: %s", async status => {
  const { settleNarrative } = await import("./narrative");
  const narrative = { version: 1 as const, people: [{ id: "father", relation: "亲生父亲", want: "回家", sharedMemory: "一起吃饭", sourceEventId: "old" }], threads: [] };
  expect(settleNarrative(narrative, { fatherStatus: status }, false)?.people).toEqual([]);
  expect(settleNarrative(narrative, { fatherStatus: "尚未去世，仍在医院" }, false)?.people).toHaveLength(1);
});
