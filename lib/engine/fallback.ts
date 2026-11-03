import type { LifeState, LifeChoice, NextEvent } from "../life";
import type { LifeScenario } from "../modes/types";
import { buildScenarioFallbackEvent } from "../modes/scenario";
import { detectStorylineDomains } from "../storyline";

const occupations = ["产品经理", "软件工程师", "教师", "设计师", "研究员"];

function variationIndex(state: LifeState, count: number) {
  let hash = state.history.length + 17;
  for (const character of state.lifeId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return hash % count;
}

export function createBirthBackground(state: LifeState) {
  const backgrounds = [
    "你来到一个普通的家庭。有人为你的到来忙碌，也有人在窗边默默看着你。此刻的世界还没有答案，只有漫长而未知的日子。",
    "你出生后的第一个夜晚很安静。家人围在身边，你尚未认识任何人，也尚未知道自己会怎样长大。",
    "你从一声啼哭开始进入这个世界。窗外的城市仍照常运转，而你的人生第一次有了自己的时间。",
    "你出生在一个平凡的清晨。有人把你轻轻抱起，从这一刻起，关系、环境和偶然都会慢慢塑造你。",
  ];
  return backgrounds[variationIndex(state, backgrounds.length)];
}

export function buildFallbackEvent(state: LifeState, choice?: LifeChoice, avoidStorylines: string[] = [], scenario?: LifeScenario): NextEvent {
  const scenarioFallback = scenario ? buildScenarioFallbackEvent(state, scenario) : null;
  if (scenarioFallback) return scenarioFallback;
  const age = state.basic.age;
  const openings = [
    { type: "family" as const, title: "你的童年开始了", story: "你还不能理解周围的声音，但你会在陪伴与日常中慢慢认识这个世界。", timePassed: 6 },
    { type: "family" as const, title: "一段安静的成长", story: "你在熟悉的屋檐下长大。许多看似微小的日常，正在成为你最早的记忆。", timePassed: 5 },
    { type: "family" as const, title: "你学会表达", story: "你开始用自己的方式回应世界。家人、玩具和窗外的声音，让每天都有新的发现。", timePassed: 6 },
    { type: "family" as const, title: "第一次离开熟悉的怀抱", story: "你开始走进更大的空间。陌生的面孔与新的规则，让你好奇，也让你有一点不安。", timePassed: 5 },
  ];
  const phase = age < 6
    ? openings[variationIndex(state, openings.length)]
    : age < 13
      ? { type: "family" as const, title: "一件只属于童年的事", story: "放学后的傍晚，你在熟悉的街道上发现了一件新鲜事。童年的世界有自己的秘密，也有第一次需要你做出的选择。", timePassed: 6 }
      : age < 18
        ? { type: "random" as const, title: "青春期的岔路", story: "你开始意识到，别人眼中的你和你心里的自己并不总是一样。一个看似微小的选择，可能改变你看待自己的方式。", timePassed: 5 }
        : age < 25
          ? { type: "career" as const, title: "离开熟悉的生活", story: "毕业在即，你第一次需要决定把时间交给哪一种生活。", timePassed: 2 }
          : age < 40
            ? { type: "relationship" as const, title: "一个需要回应的人", story: "一个重要的人向你提出了请求，你意识到继续沉默也是一种选择。", timePassed: 3 }
            : { type: "health" as const, title: "身体发来的提醒", story: "一次体检提醒你，过去习惯的生活方式正在留下痕迹。", timePassed: 3 };
  // 兜底职业也避开最近几局的主线（剧本防重最后一环）；候选全被避开时回落到完整池。
  const occupationPool = avoidStorylines.length > 0
    ? occupations.filter((occupation) => !detectStorylineDomains([occupation]).some((domain) => avoidStorylines.includes(domain)))
    : occupations;
  const safeOccupations = occupationPool.length > 0 ? occupationPool : occupations;
  const objectiveChanges = age < 18 ? {} : phase.type === "career" ? { occupation: safeOccupations[(age / 2) % safeOccupations.length | 0], incomeYearly: 120000, cash: 20000 } : phase.type === "health" ? { physical: -8, cash: -5000 } : { partnerStatus: "稳定交往" };
  return { timePassed: phase.timePassed, story: choice ? `你选择了“${choice.text}”。生活没有给出即时答案，但一些方向开始改变。` : phase.story, event: { type: phase.type, title: phase.title, importance: 0.65 }, choices: [{ id: "A", text: "顺着眼前的变化慢慢适应" }, { id: "B", text: "在熟悉的节奏里再停留一会儿" }, { id: "C", text: "试着用自己的方式回应" }], objectiveChanges, psychologicalObservation: { uncertainty: "你似乎愿意为重要的人承担一些不确定性。" }, memory: `在${age}岁，你面对了${phase.title}。` };
}

