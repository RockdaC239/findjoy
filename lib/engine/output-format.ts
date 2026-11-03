import type { EventType } from "../life";

// 模型传输协议与 LifeState 独立；改字段先改这里，再改解析映射和流式读取。
export const MODEL_OUTPUT_VERSION = 1;
export interface ModelEventOutput {
  timePassed: number;
  story: string;
  event: { type: EventType; title: string; importance: number };
  choices?: Array<{ id: string; text: string }>;
  objectiveChanges: {
    incomeYearly?: number; cash?: number; assets?: number; debt?: number;
    physical?: number; occupation?: string; partnerStatus?: string;
  };
  memory?: string;
}
export interface ModelEndingOutput {
  age: number;
  death: string;
  facts: { occupation: string; city: string; events: number };
  highlights: Array<{ age: number; title: string }>;
  patterns: string[];
}

// 字段顺序也是流式体验的一部分：时间、故事先出，标题和选项随后。
export const OUTPUT_EXAMPLES = {
  adultFormat: {"timePassed":3,"story":"...","event":{"type":"family","title":"...","importance":0.8},"choices":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}],"objectiveChanges":{},"memory":"..."} satisfies ModelEventOutput,
  adultExample: {"timePassed":3,"story":"你二十岁，和两个朋友合伙开了一间小设计工作室。半年过去，朋友想接来钱快的商业单，你想做能拿奖的原创作品。会议室里，三个人第一次吵红了脸。","event":{"type":"career","title":"商业单还是原创","importance":0.8},"choices":[{"id":"A","text":"按数据说话，先接商业单养活工作室"},{"id":"B","text":"坚持做原创，哪怕前两年不赚钱"},{"id":"C","text":"一半一半：商业单养家，原创养梦"}],"objectiveChanges":{},"memory":"那晚散会后，你在工作室画了一夜草图。"} satisfies ModelEventOutput,
  childhoodFormat: {"timePassed":5,"story":"...","event":{"type":"family","title":"...","importance":0.8},"objectiveChanges":{},"memory":"..."} satisfies ModelEventOutput,
  childhoodExample: {"timePassed":5,"story":"你九岁，升入三年级。搬家后你转学到了城东，班里一个扎马尾的女孩在课间递给你半块橡皮，你们成了同桌。","event":{"type":"random","title":"半块橡皮","importance":0.7},"objectiveChanges":{},"memory":"九岁那年，你第一次有了可以一起放学回家的朋友。"} satisfies ModelEventOutput,
  endingFormat: {"age":34,"death":"因病离世","facts":{"occupation":"教师","city":"成都","events":18},"highlights":[{"age":19,"title":"你第一次离开家"},{"age":27,"title":"你选择回到家人身边"}],"patterns":["从你的选择来看，你常常会在真正重要的时刻为关系停下来。","年轻时你也许很在意别人的认可，后来你越来越愿意按照自己的判断生活。"]} satisfies ModelEndingOutput,
};
