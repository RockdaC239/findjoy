import { describe, expect, it } from "vitest";
import { createStarterLife } from "../life";
import { prepareEventRequest, buildEndingMessages } from "./context";
import { alignProtagonistAge, normalizeGeneratedEvent, normalizeEnding, serializeTranscriptEvent } from "./event-contract";
import { readStreamedEvent } from "./stream-contract";
import { SCRIPTS } from "../modes/catalog";
import { scriptToScenario } from "../modes/scenario";

describe("engine module boundaries", () => {
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
    expect(readStreamedEvent(wire)).toEqual({ outcome: "continue", timePassed: 3, story: event!.story, title: event!.event.title, choices: event!.choices });
  });
  it("uses actual state facts in ending messages", () => {
    const state = createStarterLife({ age: 72 });
    const messages = buildEndingMessages(state);
    expect(messages.map(message => message.role)).toEqual(["system", "user"]);
    expect(JSON.parse(messages[1].content).current_age).toBe(72);
    expect(prepareEventRequest(state, undefined, []).messages[1].content).toContain('"life"');
  });
});

it("aligns the protagonist's written age with the program-computed landing age", () => {
  expect(alignProtagonistAge("你五岁，家里换了窗。", 7)).toBe("你七岁，家里换了窗。");
  expect(alignProtagonistAge("你 5 岁，家里换了窗。", 14)).toBe("你十四岁，家里换了窗。");
  expect(alignProtagonistAge("这一年家里换了窗。", 7)).toBe("这一年家里换了窗。");
});

it("keeps family illnesses out of the protagonist's conditions", () => {
  const base = { timePassed: 1, story: "你五岁，母亲做了一次手术，家里把换车的钱留了下来，晚饭后她仍需按时吃药。", event: { type: "family" as const, title: "母亲手术", importance: 0.7 }, choices: [], objectiveChanges: {} };
  const familyOnly = normalizeGeneratedEvent({ ...base, objectiveChanges: { conditions: ["母亲甲状腺术后，需长期服药"] } }, false);
  expect(familyOnly?.objectiveChanges.conditions).toBeUndefined();
  const mixed = normalizeGeneratedEvent({ ...base, objectiveChanges: { conditions: ["你哮喘", "母亲甲状腺术后，需长期服药"] } }, false);
  expect(mixed?.objectiveChanges.conditions).toEqual(["你哮喘"]);
  const cleared = normalizeGeneratedEvent({ ...base, objectiveChanges: { conditions: [] } }, false);
  expect(cleared?.objectiveChanges.conditions).toEqual([]);
});

it("preserves grounded ending prose while filtering public copy independently", () => {
  const ending = normalizeEnding({ age: 70, death: "自然离世", facts: { occupation: "维修工", city: "县城", events: 3 },
    highlights: [{ age: 22, title: "留下学手艺" }, { age: 26, title: "保留周末" }], patterns: ["你逐渐留出了自己的时间。"],
    reflection: "你为关系出了力，也为自己的生活留出了位置。", shareLines: ["留给别人的时间里，也可以有自己。", "手机号15200297440"], evidenceEventIds: ["e1", "e2"] });
  expect(ending?.reflection).toContain("自己的生活");
  expect(ending?.shareLines).toEqual(["留给别人的时间里，也可以有自己。"]);
  expect(ending?.evidenceEventIds).toEqual(["e1", "e2"]);
});

it("builds ending evidence from actual decisions and the following saved consequence", () => {
 const state=createStarterLife({age:25});
 state.history=[{id:"decision",age:22,type:"career",title:"安排周末",story:"周末有人请你接活",importance:0.8,choices:[{id:"A",text:"接活"},{id:"B",text:"留给自己"}],choiceId:"B",choiceText:"留给自己"},{id:"result",age:25,type:"relationship",title:"与朋友骑行",story:"你和朋友开始周末骑行",importance:0.7}];
 const prompt=JSON.parse(buildEndingMessages(state)[1].content);
 expect(prompt.decision_evidence).toEqual([{eventId:"decision",age:22,situation:"安排周末",action:"留给自己",consequence:{eventId:"result",age:25,title:"与朋友骑行"}}]);
 expect(JSON.stringify(prompt.decision_evidence)).not.toContain("接活");
});
