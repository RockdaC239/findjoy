import type { ModelStreamChunk } from "./engine/generate";
import type { LifeState, LifeChoice, NextEvent, LifeEnding } from "./life";

// 只替换模型返回，实际推进、存档、告别及回顾展示仍走游戏流程。
export function mockLifeEvent(state: LifeState, choice?: LifeChoice): NextEvent {
  const step = state.history.length;
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
