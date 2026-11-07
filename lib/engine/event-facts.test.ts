import { expect, it } from "vitest";
import { applyNextEvent, createStarterLife } from "../life";
import { normalizeGeneratedEvent } from "./event-contract";
import { diagnoseEventFacts } from "./event-facts";

const state = () => {
  const life = createStarterLife({ age: 40 });
  life.experienceVersion = 3;
  life.career.occupation = "学生";
  life.finance.cash = 100000;
  life.finance.debt = 200000;
  life.health.physical = 92;
  life.history = [{ id: "pending", age: 40, type: "career", title: "试行", story: "考虑下一步", importance: 0.7 }];
  return life;
};
const output = {
  outcome: "continue", timePassed: 0, narration: "你核对了账本。", story: "下一步的安排需要你决定。",
  event: { type: "career", title: "下一步", importance: 0.7 },
  choices: [{ id: "A", text: "先试一个月", requiresFollowUp: true, commitments: [] }, { id: "B", text: "长期留下", requiresFollowUp: false, commitments: [] }, { id: "C", text: "离开", requiresFollowUp: false, commitments: [] }],
  lifeChanges: [], timeline: { resultAge: 40, sceneAge: 40 }, stateUpdate: {}, objectiveChanges: {},
};
it("applies received money, full repayment and health levels without mixing deltas and snapshots", () => {
  const life = state();
  const raw = { ...output, stateUpdate: { cashFlow: { received: 300000, paid: 200000 }, debtChange: { borrowed: 0, repaid: 200000 }, physical: 80, assets: 500000 } };
  expect(diagnoseEventFacts(raw, life)).toBeNull();
  const normalized = normalizeGeneratedEvent(raw, true, undefined, undefined, life)!;
  const next = applyNextEvent(life, normalized);
  expect(next.finance).toMatchObject({ cash: 200000, debt: 0, assets: 500000 });
  expect(next.health.physical).toBe(80);
  expect(life.finance.debt).toBe(200000);
});
it("treats an employee contribution as received cash", () => {
  const life = state();
  const event = normalizeGeneratedEvent({ ...output, stateUpdate: { cashFlow: { received: 80000, paid: 0 } } }, true, undefined, undefined, life)!;
  expect(applyNextEvent(life, event).finance.cash).toBe(180000);
});
it.each([
  { stateUpdate: { cashFlow: { received: -1, paid: 0 } } },
  { stateUpdate: { cashFlow: { received: 0, paid: 100001 } } },
  { stateUpdate: { debtChange: { borrowed: 0, repaid: 200001 } } },
  { stateUpdate: { physical: 101 } },
  { stateUpdate: { assets: NaN } },
  { stateUpdate: {}, objectiveChanges: { debt: 0 } },
  { timeline: { resultAge: 43, sceneAge: 43 } },
  { timeline: { resultAge: 39, sceneAge: 40 } },
])("rejects contradictory or invalid new facts: %j", patch => {
  expect(diagnoseEventFacts({ ...output, ...patch }, state())).not.toBeNull();
});
it("keeps a promised follow-up in the same age and checks the landing age", () => {
  const life = state();
  const raw = { ...output, timePassed: 3, timeline: { resultAge: 40, sceneAge: 43 } };
  expect(diagnoseEventFacts(raw, life)).toBeNull();
  expect(diagnoseEventFacts(raw, life, output.choices[0])).not.toBeNull();
  expect(diagnoseEventFacts(output, life, output.choices[0])).toBeNull();
});

it("preserves explicit follow-up flags and new facts in saved transcripts", async () => {
  const { serializeTranscriptEvent, assertGeneratedEventForState } = await import("./event-contract");
  const life = state();
  const event = normalizeGeneratedEvent({ ...output, stateUpdate: { physical: 80, cashFlow: { received: 80000, paid: 0 } } }, true, undefined, undefined, life)!;
  expect(event.choices[0].requiresFollowUp).toBe(true);
  const transcript = JSON.parse(serializeTranscriptEvent(event));
  expect(transcript.stateUpdate).toMatchObject({ physical: 80, cashFlow: { received: 80000, paid: 0 } });
  expect(transcript.objectiveChanges).not.toHaveProperty("physical");
  expect(transcript.objectiveChanges).not.toHaveProperty("cash");
  expect(() => assertGeneratedEventForState(event, life)).not.toThrow();
});
it("rejects missing follow-up flags and unsafe monetary values", () => {
  const life = state();
  expect(diagnoseEventFacts({ ...output, choices: output.choices.map(({ id, text }) => ({ id, text })) }, life)).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, stateUpdate: { cashFlow: { received: Number.MAX_VALUE, paid: 0 } } }, life)).not.toBeNull();
});

it("rejects unchosen marriage and parenthood while allowing explicitly authorized commitments", () => {
  const life = state();
  const choice = { id: "A", text: "继续找中间地段的房子", commitments: ["housing" as const] };
  const marriage = { ...output, lifeChanges: ["marriage"], objectiveChanges: { partnerStatus: "已婚" } };
  expect(diagnoseEventFacts(marriage, life, choice)).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, objectiveChanges: { children: ["女儿"] } }, life, choice)).not.toBeNull();
  expect(diagnoseEventFacts(marriage, life, { id: "B", text: "领证结婚", commitments: ["marriage"] })).toBeNull();
});

it("rejects arithmetic overflow and mismatched adapter deltas at the save boundary", async () => {
  const { assertGeneratedEventForState } = await import("./event-contract");
  const life = state();
  life.finance.cash = Number.MAX_SAFE_INTEGER;
  expect(diagnoseEventFacts({ ...output, stateUpdate: { cashFlow: { received: 1, paid: 0 } } }, life)).not.toBeNull();
  const event = normalizeGeneratedEvent({ ...output, stateUpdate: { physical: 80 } }, true, undefined, undefined, state())!;
  expect(() => assertGeneratedEventForState({ ...event, objectiveChanges: { physical: 80 } }, state())).toThrow();
});

it("allows the condition of an existing marriage to evolve without forming a new commitment", () => {
  const life = state();
  life.relationships.partner.status = "已婚";
  for (const status of ["婚姻稳定", "婚姻紧张"]) {
    expect(diagnoseEventFacts({ ...output, objectiveChanges: { partnerStatus: status } }, life, { id: "A", text: "周末休息", commitments: [] })).toBeNull();
  }
});
it.each(["咖啡店店主", "退休"])("requires permission for an adult career transition to %s", occupation => {
  const life = state();
  life.career.occupation = "软件工程师";
  const raw = { ...output, objectiveChanges: { occupation } };
  expect(diagnoseEventFacts(raw, life, { id: "A", text: "周末休息", commitments: [] })).not.toBeNull();
  expect(diagnoseEventFacts({ ...raw, lifeChanges: ["career"] }, life, { id: "B", text: "改变职业安排", commitments: ["career"] })).toBeNull();
});

it("rejects nested identity updates and non-finite annual income in the fresh protocol", () => {
  const life = state();
  expect(diagnoseEventFacts({ ...output, objectiveChanges: { career: { occupation: "咖啡店店主" } } }, life)).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, objectiveChanges: { incomeYearly: Infinity } }, life)).not.toBeNull();
});

it("accepts unambiguous typed commitment entries and canonicalizes them for saved choices", () => {
  const life = state();
  const raw = { ...output, choices: output.choices.map(choice => ({ ...choice, commitments: [{ type: "career" }] })) };
  expect(diagnoseEventFacts(raw, life)).toBeNull();
  expect(normalizeGeneratedEvent(raw, true, undefined, undefined, life)?.choices[0].commitments).toEqual(["career"]);
});

it("keeps an authorized school choice valid when the model omits its redundant lifeChanges tag", async () => {
  const { completeEventFacts } = await import("./event-facts");
  const life = state(); life.basic.education = "高中毕业";
  const raw = { ...output, objectiveChanges: { education: "本科在读" } };
  const completed = completeEventFacts(raw, life, { id: "A", text: "填外地学校", commitments: ["education"] });
  expect(diagnoseEventFacts(completed, life)).toBeNull();
  expect((completed as typeof raw).lifeChanges).toEqual(["education"]);
});
it("does not allow an unchosen university path to hide behind a graduation label", () => {
  const life = state(); life.basic.education = "高中毕业";
  const raw = { ...output, objectiveChanges: { education: "本科毕业" } };
  expect(diagnoseEventFacts(raw, life, { id: "A", text: "周末休息", commitments: [] })).not.toBeNull();
  life.basic.education = "大学在读";
  expect(diagnoseEventFacts(raw, life, { id: "A", text: "周末休息", commitments: [] })).toBeNull();
});

it("rejects explicit marriage and child assertions omitted from the structured facts", () => {
  const life = state();
  expect(diagnoseEventFacts({ ...output, narration: "三十二岁，你们领了证，在附近住下。" }, life)).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, narration: "你的妻子把茶端过来。" }, life)).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, narration: "你们有了一个女儿。" }, life)).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, narration: "同事结婚了。有人问：“你们领了证？”你摇头。" }, life)).toBeNull();
  life.relationships.partner.status = "已婚";
  expect(diagnoseEventFacts({ ...output, narration: "你的妻子把茶端过来。" }, life)).toBeNull();
});

it("allows references to an existing spouse or child when their current status changes", () => {
  const life = state();
  life.relationships.partner.status = "已婚";
  life.relationships.children = ["儿子"];
  expect(diagnoseEventFacts({ ...output, narration: "你的妻子去世了。", objectiveChanges: { partnerStatus: "丧偶" } }, life)).toBeNull();
  expect(diagnoseEventFacts({ ...output, narration: "你的儿子走了。", objectiveChanges: { children: [] } }, life)).toBeNull();
});

it("allows an authorized return from unemployment to student status without a career change", async () => {
  const { completeEventFacts } = await import("./event-facts");
  const life = state(); life.career.occupation = "待业"; life.basic.education = "高中毕业";
  const choice = { id: "A", text: "报到读大学", commitments: ["education" as const] };
  const raw = { ...output, objectiveChanges: { occupation: "学生", education: "本科在读" } };
  expect(diagnoseEventFacts(completeEventFacts(raw, life, choice), life, choice)).toBeNull();
});
it("canonicalizes an occupation label object before validating the new facts", async () => {
  const { completeEventFacts } = await import("./event-facts");
  const life = state(); life.career.occupation = "婴儿";
  const raw = { ...output, objectiveChanges: { occupation: { label: "学生" }, careerStage: "student" } };
  const completed = completeEventFacts(raw, life);
  expect(diagnoseEventFacts(completed, life)).toBeNull();
  expect(normalizeGeneratedEvent(completed, true, undefined, undefined, life)?.objectiveChanges.occupation).toBe("学生");
});

it("requires the protagonist's endpoint rather than an atmospheric or parental ending", () => {
  const life = state();
  const raw = { ...output, outcome: "death", deathCause: "natural", story: "", choices: [] };
  expect(diagnoseEventFacts({ ...raw, narration: "母亲走了。\n\n你收好她的东西，阳光照着小木凳。" }, life)).not.toBeNull();
  expect(diagnoseEventFacts({ ...raw, narration: "你把最后的日子安排妥当。\n\n你在熟悉的房间里安静离世。" }, life)).toBeNull();
});

it("rejects malformed child snapshots instead of accepting parenthood with no saved children", () => {
  const life = state();
  expect(diagnoseEventFacts({ ...output, lifeChanges: ["parenthood"], objectiveChanges: { children: [42] } }, life)).not.toBeNull();
});

it.each([
  "那天夜里，你睡着以后没再醒过来。\n\n床头放着你留下的木盒。",
  "有天夜里你睡下，早上没再醒过来。院里辣椒红了。",
  "你没有再醒来。",
  "邻居开门时，你已经走了。",
  "车开出去后，你闭上眼，手从担架边滑下，这一生到此为止。",
])("accepts an explicit quiet endpoint without forcing a template sentence", narration => {
  expect(diagnoseEventFacts({ ...output, outcome: "death", story: "", choices: [], narration }, state())).toBeNull();
});

it("uses an unknown death cause when omitted without inventing a medical explanation", async () => {
  const { completeEventFacts } = await import("./event-facts");
  const life = state();
  const raw = { ...output, outcome: "death", story: "", choices: [], narration: "你在家中安静离世。" };
  const completed = completeEventFacts(raw, life);
  expect(normalizeGeneratedEvent(completed, true, undefined, undefined, life)?.deathCause).toBe("other");
  expect(raw).not.toHaveProperty("deathCause");
});

it("fills omitted empty terminal fields without erasing an explicit pending decision", async () => {
  const { completeEventFacts } = await import("./event-facts");
  const life = state();
  const { story: _story, choices: _choices, ...rest } = output;
  void _story; void _choices;
  const raw = { ...rest, outcome: "death", narration: "你在家中安静离世。" };
  expect(normalizeGeneratedEvent(completeEventFacts(raw, life), true, undefined, undefined, life)?.story).toBe("");
  expect(normalizeGeneratedEvent(completeEventFacts({ ...raw, story: "下周是否手术？" }, life), true, undefined, undefined, life)).toBeNull();
});

it("rejects entering senior high or secondary vocational school without a player choice", () => {
  const life = state(); life.basic.education = "初中在读"; life.career.occupation = "学生";
  // 真实样本：只处理了童年物件，下一幕却已经在中职机电车间。
  const secondary = { ...output, objectiveChanges: { education: "中职在读，机电技术应用专业" } };
  expect(diagnoseEventFacts(secondary, life, { id: "A", text: "让收废品的把鱼缸搬走", commitments: [] })).toContain("中职");
  expect(diagnoseEventFacts({ ...secondary, lifeChanges: ["education"] }, life, { id: "B", text: "决定去读中职", commitments: ["education"] })).toBeNull();

  // 普通高中是义务教育后的常规延续，不强制授权；否则 15→18 的跨年会反复重试。
  const senior = { ...output, objectiveChanges: { education: "高中在读" } };
  expect(diagnoseEventFacts(senior, life, { id: "A", text: "周末去帮忙", commitments: [] })).toBeNull();
  // 小学直接跳到高中仍然失衡，要拦。
  life.basic.education = "小学在读";
  expect(diagnoseEventFacts(senior, life, { id: "A", text: "周末去帮忙", commitments: [] })).not.toBeNull();
});

it("lets ordinary grade progression and graduation through", () => {
  const life = state();
  const cases: Array<[string, string]> = [
    ["初中在读", "初中毕业"],
    ["小学在读", "初中在读"],
    ["初中在读", "高中在读"],
    ["高中在读", "高二在读"],
    ["高中在读", "高中毕业"],
    ["大学在读", "本科毕业"],
    ["未开始", "小学在读"],
  ];
  for (const [from, to] of cases) {
    life.basic.education = from;
    expect(diagnoseEventFacts({ ...output, objectiveChanges: { education: to } }, life, { id: "A", text: "照常上学", commitments: [] }), `${from}→${to}`).toBeNull();
  }
});

it("does not guess when the saved education stage is unknown", () => {
  const life = state(); life.basic.education = "已成年";
  expect(diagnoseEventFacts({ ...output, objectiveChanges: { education: "本科在读" } }, life, { id: "A", text: "回家", commitments: [] })).toBeNull();
  // “未开始”只是还没填学历：15 岁开篇第一次写“高中在读”不能被拦，否则第一幕会卡死。
  life.basic.education = "未开始";
  expect(diagnoseEventFacts({ ...output, age: 15, objectiveChanges: { education: "高中在读" } }, life, { id: "A", text: "周末去帮忙", commitments: [] })).toBeNull();
  expect(diagnoseEventFacts({ ...output, age: 15, objectiveChanges: { education: "中职在读" } }, life, { id: "A", text: "周末去帮忙", commitments: [] })).toBeNull();
});

it("still rejects an unchosen graduate path", () => {
  const life = state(); life.basic.education = "本科毕业";
  expect(diagnoseEventFacts({ ...output, objectiveChanges: { education: "硕士研究生在读" } }, life, { id: "A", text: "先去工作", commitments: [] })).not.toBeNull();
  expect(diagnoseEventFacts({ ...output, objectiveChanges: { education: "本科毕业" } }, life, { id: "A", text: "先去工作", commitments: [] })).toBeNull();
});

it("recognises composite education strings such as '高中毕业，考入省城院校机械专业'", () => {
  const life = state(); life.basic.education = "初中在读";
  const composite = { ...output, objectiveChanges: { education: "高中毕业，考入省城院校机械专业" } };
  expect(diagnoseEventFacts(composite, life, { id: "A", text: "把表放着", commitments: [] })).not.toBeNull();
  life.basic.education = "高中在读";
  expect(diagnoseEventFacts(composite, life, { id: "A", text: "把表放着", commitments: [] })).not.toBeNull();
  expect(diagnoseEventFacts({ ...composite, lifeChanges: ["education"] }, life, { id: "B", text: "决定报机械专业", commitments: ["education"] })).toBeNull();
});
