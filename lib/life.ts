import { applyNarrative, resolveNarrativeReferences, type NarrativeState, type NarrativeUpdate } from "./engine/narrative";
import type { LifeScenario } from "./modes/types";

export type Gender = "female" | "male" | "nonbinary" | "unspecified";
export type EventType = "career" | "relationship" | "health" | "finance" | "random" | "family";

export interface LifeBasics {
  age: number;
  gender: Gender;
  city: string;
  education: string;
}

export interface LifeState {
  lifeId: string;
  basic: LifeBasics;
  career: { occupation: string; companyType: string; incomeYearly: number; careerStage: string };
  finance: { cash: number; assets: number; debt: number; housing: string };
  health: { physical: number; conditions: string[]; lifestyle: string };
  relationships: { partner: { status: string; years: number }; children: string[]; parents: { status: string; fatherStatus?: string; motherStatus?: string }; friends: string[] };
  psychology: { valueProfile: Record<string, number>; behaviorPatterns: string[]; internalConflicts: string[] };
  history: LifeEvent[];
  majorMemories: string[];
  flags: Record<string, boolean | string | number>;
  /** 玩法情境；旧存档没有该字段时按普通人生处理。 */
  scenario?: LifeScenario;
  narrative?: NarrativeState;
  dead: boolean;
  createdAt: string;
}

export interface LifeChoice { id: string; text: string }

// 把客户端送来的选择规整为模型真正给出的选项文案（按 id 匹配待定节点上的选项）。
// 脚本或异常客户端可能发送与选项无关的文本；模型收到"不属于任何选项"的选择时
// 会认为没有真正做决定，进而在下一轮复述上一事件（刚进入决策阶段时节点重复的根因）。
// 规整后模型永远看到自己给出的 A/B/C 文案，转录里存的也是同一份，保证请求与转录一致。
export function resolveOfferedChoice(choice: LifeChoice | undefined, pendingNode: LifeEvent | undefined): LifeChoice | undefined {
  if (!choice || !pendingNode?.choices) return choice;
  const offered = pendingNode.choices.find((item) => item.id === choice.id);
  return offered ?? choice;
}
export type DeathCause = "natural" | "disease" | "accident" | "other" | "age";

export interface LifeEvent {
  outcome?: "continue" | "death";
  deathCause?: DeathCause;
  id: string;
  age: number;
  type: EventType;
  title: string;
  story: string;
  /** 该节点展示给玩家的完整选项（2~3 个）；童年纯叙事节点为空数组。缺失表示旧存档。 */
  choices?: LifeChoice[];
  choiceId?: string;
  choiceText?: string;
  importance: number;
  memory?: string;
  objectiveChanges?: Partial<ObjectiveChanges>;
  narrative?: NarrativeUpdate;
  /** 该节点写入时间（UTC ISO），用于逐节点追溯。 */
  storedAt?: string;
  /** 生成该节点时的模型调用用量（token/成本/前缀缓存命中），用于追溯与成本审计。 */
  usage?: ModelUsage;
}
export interface ObjectiveChanges { incomeYearly: number; cash: number; assets: number; debt: number; physical: number; occupation: string; partnerStatus: string; city: string; education: string; parentsStatus: string; fatherStatus: string; motherStatus: string; children: string[]; friends: string[]; conditions: string[] }
export interface NextEvent { narrative?: NarrativeUpdate; outcome?: "continue" | "death"; deathCause?: DeathCause; timePassed: number; story: string; event: Pick<LifeEvent, "type" | "title" | "importance">; choices: LifeChoice[]; objectiveChanges: Partial<ObjectiveChanges>; psychologicalObservation?: Record<string, string>; memory?: string; usage?: ModelUsage }
export interface ModelUsage { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number; provider: string; model: string; fallbackReason?: string; promptCacheHitTokens?: number; promptCacheMissTokens?: number }

const cities = ["深圳", "上海", "北京", "杭州", "成都", "广州", "南京", "武汉", "西安", "重庆", "苏州", "天津"];

function randomCity(random: () => number = Math.random) {
  return cities[Math.floor(random() * cities.length)] ?? cities[0];
}

export function createStarterLife(input: Partial<LifeBasics> = {}): LifeState {
  const lifeId = crypto.randomUUID();
  return {
    lifeId,
    basic: { age: input.age ?? 0, gender: input.gender ?? "unspecified", city: input.city ?? randomCity(), education: input.education ?? "未开始" },
    career: { occupation: "婴儿", companyType: "家庭", incomeYearly: 0, careerStage: "childhood" },
    finance: { cash: 8000, assets: 8000, debt: 0, housing: "与家人同住" },
    health: { physical: 92, conditions: [], lifestyle: "普通" },
    relationships: { partner: { status: "单身", years: 0 }, children: [], parents: { status: "健在" }, friends: [] },
    psychology: { valueProfile: {}, behaviorPatterns: [], internalConflicts: [] },
    history: [], majorMemories: [], flags: {}, scenario: { mode: "normal" }, dead: false, createdAt: new Date().toISOString(),
  };
}

// applyNextEvent 把一次模型事件推进到状态里：
// - 玩家本次选择（choice）挂到“给出该选择”的上一个节点上（history 末尾的待定节点），
//   而不是挂到本节点，消除时间轴上决策错位一格的问题；
// - 新节点以“待定”状态入列（choiceId/choiceText 暂缺），等玩家做出选择后由下一次调用补齐；
// - 开局节点（start 路由，无 choice + ）同样以待定节点入列，不再丢失。
export function applyNextEvent(
  state: LifeState,
  event: NextEvent,
  choice?: LifeChoice,
  options: { allowZeroTime?: boolean } = {},
): LifeState {
  const changes = event.objectiveChanges ?? {};
  // ForU/剧本的第一幕发生在“当前年龄”，timePassed=0；其余节点仍至少推进 1 年。
  const rawTimePassed = options.allowZeroTime ? Math.max(0, event.timePassed || 0) : Math.max(1, event.timePassed || 1);
  const age = state.basic.age + rawTimePassed;
  const next: LifeState = structuredClone(state);
  next.basic.age = age;
  if (changes.occupation) next.career.occupation = changes.occupation;
  if (typeof changes.incomeYearly === "number") next.career.incomeYearly = Math.max(0, changes.incomeYearly);
  if (typeof changes.cash === "number") next.finance.cash = Math.max(0, next.finance.cash + changes.cash);
  if (typeof changes.assets === "number") next.finance.assets = Math.max(0, next.finance.assets + changes.assets);
  if (typeof changes.debt === "number") next.finance.debt = Math.max(0, next.finance.debt + changes.debt);
  if (typeof changes.physical === "number") next.health.physical = Math.max(0, Math.min(100, next.health.physical + changes.physical));
  if (changes.partnerStatus) next.relationships.partner.status = changes.partnerStatus;
  if (changes.city) next.basic.city = changes.city;
  if (changes.education) next.basic.education = changes.education;
  if (changes.children) next.relationships.children = [...changes.children];
  if (changes.friends) next.relationships.friends = [...changes.friends];
  if (changes.conditions) next.health.conditions = [...changes.conditions];
  const parents = next.relationships.parents;
  if (changes.parentsStatus && !parents.fatherStatus && !parents.motherStatus) parents.status = changes.parentsStatus;
  if (changes.fatherStatus) parents.fatherStatus = changes.fatherStatus;
  if (changes.motherStatus) parents.motherStatus = changes.motherStatus;
  if (parents.fatherStatus || parents.motherStatus) parents.status = `父亲：${parents.fatherStatus ?? "未记录"}；母亲：${parents.motherStatus ?? "未记录"}`;
  const pending = next.history.at(-1);
  let choiceAttached = false;
  if (pending && !pending.choiceId && (pending.choices?.length ?? 0) > 0 && choice?.id && choice.id !== "none" && choice.text) {
    pending.choiceId = choice.id;
    pending.choiceText = choice.text;
    choiceAttached = true;
  }
  const record: LifeEvent = {
    id: crypto.randomUUID(),
    age,
    type: event.event.type,
    title: event.event.title,
    story: event.story,
    choices: event.outcome === "death" ? [] : event.choices ?? [],
    outcome: event.outcome,
    deathCause: event.deathCause,
    importance: event.event.importance,
    memory: event.memory,
    objectiveChanges: changes,
    narrative: event.narrative,
    storedAt: new Date().toISOString(),
    usage: event.usage,
  };
  record.narrative = resolveNarrativeReferences(event.narrative, record.id, state.history.map(item => item.id));
  next.history.push(record);
  next.narrative = applyNarrative(state.narrative, record.narrative, record.id, state.history.map(item => item.id));
  // 兜底：直接调用方（无待定决策节点可挂，如单次生成）把选择挂到本节点上，保持旧语义。
  if (!choiceAttached && choice?.id && choice.id !== "none" && choice.text) {
    record.choiceId = choice.id;
    record.choiceText = choice.text;
  }
  if (event.memory && event.event.importance >= 0.65) next.majorMemories.push(event.memory);
  // 生死由本轮模型结果确定，不在故事展示后另掷一次死亡概率。
  if (event.outcome === "death") {
    next.dead = true;
    next.flags.deathCause = event.deathCause ?? "other";
  }
  return next;
}

export const DEATH_CAUSE_LABEL: Record<string, string> = {
  natural: "自然离世",
  other: "离开了这个世界",
  disease: "因病离世",
  accident: "意外离世",
  age: "在很深的年纪平静离世",
};

export interface LifeEndingHighlight { age: number; title: string }
export interface LifeEnding {
  age: number;
  death: string;
  facts: { occupation: string; city: string; events: number };
  highlights: LifeEndingHighlight[];
  patterns: string[];
  question: string;
}

export function buildEnding(state: LifeState): LifeEnding {
  const highlights = state.history.filter((event) => event.importance >= 0.65).slice(-8).map((event) => ({ age: event.age, title: event.title }));
  const causeLabel = typeof state.flags.deathCause === "string" ? DEATH_CAUSE_LABEL[state.flags.deathCause] : "自然离世";
  return { age: state.basic.age, death: causeLabel, facts: { occupation: state.career.occupation, city: state.basic.city, events: state.history.length }, highlights, patterns: state.psychology.behaviorPatterns.length ? state.psychology.behaviorPatterns : ["你在一次次选择中，逐渐形成了自己的生活节奏。"], question: "如果可以再活一次，你会做出不同的选择吗？" };
}
