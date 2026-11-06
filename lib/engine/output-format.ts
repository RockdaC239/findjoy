import examples from "./prompts/examples.json";
import type { NarrativeUpdate } from "./narrative";
import type { EventType, ObjectiveChanges } from "../life";

// 协议类型与 LifeState 独立；字段变化同步外置 examples.json、解析映射和流式读取。
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
export const OUTPUT_EXAMPLES = examples as {
  twoSceneFormat: ModelEventOutput;
  adultFormat: ModelEventOutput;
  adultExample: ModelEventOutput;
  childhoodFormat: ModelEventOutput;
  childhoodExample: ModelEventOutput;
  endingFormat: ModelEndingOutput;
};
