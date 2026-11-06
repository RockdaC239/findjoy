import { CHILDHOOD_BOUNDARY, needsOpeningRecovery } from "./engine/phase";
import type { ModelStreamChunk } from "./engine/generate";
import type { LifeState, LifeChoice, NextEvent, LifeEnding } from "./life";

// 只替换模型返回，实际推进、存档、告别及回顾展示仍走游戏流程。
export function mockLifeEvent(state: LifeState, choice?: LifeChoice): NextEvent {
  const step = state.history.length;
  if (state.experienceVersion === 3) {
    if (needsOpeningRecovery(state)) return {
      outcome: "continue", timePassed: CHILDHOOD_BOUNDARY - state.basic.age,
      narration: "已有的童年经历留在记忆里。你继续上学，在熟悉的地方慢慢长大，直到需要亲自回应新的事情。",
      story: "朋友邀你参加一次作品交流，你想怎样参与？",
      event: { type: "relationship", title: "第一次参与", importance: 0.7 },
      choices: [{ id: "A", text: "准备自己的作品" }, { id: "B", text: "先去听听大家的分享" }],
      objectiveChanges: { occupation: "学生", education: "初中在读" },
    };
    if (step === 0) {
      const fixedAge = state.scenario?.mode === "script" || state.scenario?.mode === "foru";
      return { outcome: "continue", timePassed: fixedAge ? 0 : CHILDHOOD_BOUNDARY, narration: fixedAge ? "你在熟悉的城市醒来，今天有一件事需要认真回应。" : "你出生后，家人轮流照料你。上学后的放学路越来越熟悉，你和一个同学常在书店门口等彼此。十五岁那年，对方第一次把自己的画册给你看。", story: fixedAge ? "朋友约你周末一起出门，你需要安排这段时间。" : "同学想报名画展，希望你陪着去交作品；那天你也想去看一场期待已久的球赛。", event: {type:"relationship",title:"周末的约定",importance:0.7}, choices:[{id:"A",text:"陪朋友去，把自己的安排往后放"},{id:"B",text:"说明已有安排，约另一个时间见面"}],objectiveChanges: fixedAge ? {} : { occupation: "学生", education: "初中在读" },memory:"朋友向你发出了邀请。" };
    }
    if (step === 1) return {
      outcome: "continue", timePassed: 1,
      narration: choice?.id === "A"
        ? "你陪朋友去了，两人在路上把最担心的事说开。之后的一年，你们开始互相分享各自的新发现，偶尔也一起看球。"
        : "你说明了已有安排，朋友答应另约时间。之后的一年，你们慢慢找到各自舒服的相处节奏，不必每次一起出门，也愿意给彼此留一段时间。",
      story: "朋友想和几个人办一场小型作品交流，问你愿不愿意参与。你可以帮忙把活动组织起来，也可以带一件自己做的小东西去分享。",
      event: { type: "relationship", title: "一起办一场交流", importance: 0.7 },
      choices: [{ id: "A", text: "帮忙组织，让大家有机会交流" }, { id: "B", text: "准备自己的作品，参加交流" }],
      objectiveChanges: {}, memory: "你和朋友找到了相处节奏，开始商量一场作品交流。",
    };
    return { outcome: "death", deathCause: "natural", timePassed: state.scenario?.mode === "script" || state.scenario?.mode === "foru" ? 5 : 8, narration: `${choice?.id === "A" ? "你帮着组织了交流，大家围坐着谈到很晚。" : "你带去了自己的作品，朋友认真听完你的介绍。"}后来的日子里，这次认真回应仍留在彼此记忆中。生命的最后一个清晨，你在熟悉的人陪伴中安静离世。`,story:"",event:{type:"health",title:"最后一个清晨",importance:1},choices:[],objectiveChanges:{},memory:"你在熟悉的人的陪伴中告别。" };
  }
  if (step === 0) return { outcome: "continue", timePassed: 8, story: "你八岁，搬家后第一次走进新教室。一个同学挪了挪课桌，为你留出位置。放学时，你已经记住了回家的路。", event: { type: "family", title: "新教室里的一个位置", importance: 0.7 }, choices: [], objectiveChanges: {}, memory: "八岁那年，你走进了新的教室。" };
  if (step === 1) return { outcome: "continue", timePassed: 24, story: "你三十二岁，一份外地工作的邀请摆在桌上。电话那头，家人问你这个周末是否回来吃饭。你需要决定，把接下来的日子留给哪里。", event: { type: "career", title: "一份外地工作的邀请", importance: 0.8 }, choices: [{ id: "A", text: "接受邀请，去新的城市试试" }, { id: "B", text: "留在家人身边，继续现在的工作" }, { id: "C", text: "先谈谈远程工作的可能" }], objectiveChanges: { occupation: "教师", incomeYearly: 120000 }, memory: "三十二岁，你在一次工作邀请前停下来。" };
  return { outcome: "death", deathCause: "natural", timePassed: Math.max(1, 81 - state.basic.age), story: `你八十一岁，清晨的光落在窗沿。${choice?.id === "A" ? "你想起那次出发，以及后来慢慢熟悉的新城市。" : "你想起那些和家人坐在一起的普通傍晚。"}家人坐在身边，你慢慢闭上眼睛。这一生停在一个安静的早晨。`, event: { type: "family", title: "最后一个清晨", importance: 1 }, choices: [], objectiveChanges: {}, memory: "八十一岁，你在家人的陪伴中告别。" };
}
export async function* streamMockLifeEvent(state: LifeState, choice?: LifeChoice): AsyncGenerator<ModelStreamChunk, NextEvent> {
  const event = mockLifeEvent(state, choice);
  const text = JSON.stringify(event);
  for (let at = 0; at < text.length; at += 48) {
    await new Promise(resolve => setTimeout(resolve, 20));
    yield { text: text.slice(at, at + 48) };
  }
  return event;
}
export function mockLifeEnding(state: LifeState): LifeEnding {
  return { age: state.basic.age, death: "自然离世", facts: { occupation: state.career.occupation, city: state.basic.city, events: state.history.length }, highlights: state.history.map(event => ({ age: event.age, title: event.title })), patterns: ["从你的选择来看，你似乎一直在尝试，为重要的人和自己的愿望留出位置。"], question: "如果这是你真实的一生，你愿意这样活吗？" };
}
