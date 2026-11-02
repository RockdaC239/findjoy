import type { LifeView } from "./life-view";
import { getScenarioLabel, getScenarioReviewQuestion } from "./modes/scenario";

export interface Review {
  age: number;
  death: string;
  facts: string[];
  moments: string[];
  observation: string;
  question: string;
  modeLabel: string;
  modeDetail: string;
}

const demoReview: Review = {
  age: 82,
  death: "在很深的年纪平静离世",
  facts: ["经历过不同的工作与生活阶段", "拥有过重要的关系与告别", "在几座城市留下自己的日常"],
  moments: [
    "你第一次意识到，选择本身也会改变你。",
    "你在一个艰难的阶段重新安排了生活的重心。",
    "你经历挫折后，没有立刻给自己新的答案。",
    "你在一次告别中，看见了关系留下的重量。",
  ],
  observation:
    "从你的选择来看，你常常会在真正重要的时刻为关系停下来。年轻时，你也许很在意证明自己；后来，你似乎越来越愿意把时间留给那些无法替代的人和事。",
  question: "如果这是你真实的一生，你愿意这样活吗？",
  modeLabel: "普通模式",
  modeDetail: "随机出身 · 从 0 岁开始",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

export function parseReview(payload: unknown, current: LifeView): Review {
  if (!isRecord(payload) || !isRecord(payload.ending)) {
    const meta = getScenarioLabel(current.scenario);
    return {
      ...demoReview,
      age: current.age,
      facts: [current.occupation || "走过一段普通人生", `在${current.city || "一座城市"}生活过`, "回顾暂时没有生成"],
      moments: [],
      observation: "这一生的回顾暂时没有生成，但你做过的选择已经留在这段人生里。",
      question: getScenarioReviewQuestion(current.scenario),
      modeLabel: meta.label,
      modeDetail: meta.detail,
    };
  }
  const ending = payload.ending;
  const facts = isRecord(ending.facts) ? ending.facts : {};
  const highlights = Array.isArray(ending.highlights) ? ending.highlights : [];
  const patterns = Array.isArray(ending.patterns) ? ending.patterns : [];
  const moments = highlights.flatMap((item) => {
    if (!isRecord(item)) return [];
    const age = typeof item.age === "number" ? `${item.age} 岁，` : "";
    const title = getString(item.title, "一次重要的选择");
    return [`${age}${title}。`];
  });
  const eventCount = typeof facts.events === "number" ? `经历 ${facts.events} 个重要人生事件` : "经历许多重要的选择";
  return {
    age: typeof ending.age === "number" ? ending.age : demoReview.age,
    death: getString(ending.death, demoReview.death),
    facts: [getString(facts.occupation, current.occupation), `在${getString(facts.city, current.city)}生活过`, eventCount],
    moments: moments.length ? moments : demoReview.moments,
    observation: patterns.filter((item): item is string => typeof item === "string").join(" ") || demoReview.observation,
    question: getScenarioReviewQuestion(current.scenario),
    modeLabel: getScenarioLabel(current.scenario).label,
    modeDetail: getScenarioLabel(current.scenario).detail,
  };
}
