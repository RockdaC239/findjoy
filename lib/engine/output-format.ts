import type { NarrativeUpdate } from "./narrative";
import type { EventType, ObjectiveChanges } from "../life";

// 模型传输协议与 LifeState 独立；改字段先改这里，再改解析映射和流式读取。
export const MODEL_OUTPUT_VERSION = 3;
export const LEGACY_MODEL_OUTPUT_VERSION = 2;
export interface ModelEventOutput {
  outcome: "continue" | "death";
  deathCause?: "natural" | "disease" | "accident" | "other";
  timePassed: number;
  narration?: string;
  story: string;
  event: { type: EventType; title: string; importance: number };
  choices?: Array<{ id: string; text: string }>;
  objectiveChanges: Partial<ObjectiveChanges>;
  narrative?: NarrativeUpdate;
  memory?: string;
}
export interface ModelEndingOutput {
  age: number;
  death: string;
  facts: { occupation: string; city: string; events: number };
  highlights: Array<{ age: number; title: string }>;
  patterns: string[];
  reflection?: string;
  shareLines?: string[];
  evidenceEventIds?: string[];
}

// 字段顺序也是流式体验的一部分：时间、故事先出，标题和选项随后。
export const OUTPUT_EXAMPLES = {
  twoSceneFormat: { outcome: "continue", timePassed: 0, narration: "上一行动的回应与生活变化", story: "下一次需要回应的处境", event: { type: "relationship", title: "下一决定", importance: 0.7 }, choices: [{ id: "A", text: "具体行动一" }, { id: "B", text: "具体行动二" }], objectiveChanges: {}, memory: "已经发生的变化" } satisfies ModelEventOutput,
  adultFormat: {"outcome":"continue","timePassed":3,"story":"...","event":{"type":"family","title":"...","importance":0.8},"choices":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}],"objectiveChanges":{},"memory":"...","narrative":{"threads":[]}} satisfies ModelEventOutput,
  adultExample: {"outcome":"continue","timePassed":2,"story":"你二十六岁，交班前把修好的水泵推回试机台。上次你坚持说明返工风险，客人仍愿意等；今天机器连续运转了半小时，师傅让你亲自签验收单。客人想把另一处站点的维护也交给你，可那里每周需要出门两天，原先的休息安排得重新商量。","event":{"type":"career","title":"验收单交到了你手里","importance":0.8},"choices":[{"id":"A","text":"先接一处站点，按自己的时间安排服务"},{"id":"B","text":"和同业联合接单，把分工和责任提前谈清"}],"objectiveChanges":{},"memory":"你完成了此前说明风险的维修，第一次独立签下验收单。"} satisfies ModelEventOutput,
  childhoodFormat: {"outcome":"continue","timePassed":5,"story":"...","event":{"type":"family","title":"...","importance":0.8},"objectiveChanges":{},"memory":"...","narrative":{"threads":[]}} satisfies ModelEventOutput,
  childhoodExample: {"outcome":"continue","timePassed":5,"story":"你九岁，升入三年级。搬家后你转学到了城东，班里一个扎马尾的女孩在课间递给你半块橡皮，你们成了同桌。","event":{"type":"random","title":"半块橡皮","importance":0.7},"objectiveChanges":{},"memory":"九岁那年，你第一次有了可以一起放学回家的朋友。"} satisfies ModelEventOutput,
  endingFormat: {"reflection":"基于真实选择的一段回顾与自然融入的方向","shareLines":["只保留不含隐私的完整短句"],"evidenceEventIds":["来源事件id"],"age":34,"death":"因病离世","facts":{"occupation":"教师","city":"成都","events":18},"highlights":[{"age":19,"title":"你第一次离开家"},{"age":27,"title":"你选择回到家人身边"}],"patterns":["从你的选择来看，你常常会在真正重要的时刻为关系停下来。","年轻时你也许很在意别人的认可，后来你越来越愿意按照自己的判断生活。"]} satisfies ModelEndingOutput,
};
