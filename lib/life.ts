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
  relationships: { partner: { status: string; years: number }; children: string[]; parents: { status: string }; friends: string[] };
  psychology: { valueProfile: Record<string, number>; behaviorPatterns: string[]; internalConflicts: string[] };
  history: LifeEvent[];
  majorMemories: string[];
  flags: Record<string, boolean | string | number>;
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
export interface LifeEvent {
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
  /** 该节点写入时间（UTC ISO），用于逐节点追溯。 */
  storedAt?: string;
  /** 生成该节点时的模型调用用量（token/成本/前缀缓存命中），用于追溯与成本审计。 */
  usage?: ModelUsage;
}
export interface ObjectiveChanges { incomeYearly: number; cash: number; assets: number; debt: number; physical: number; occupation: string; partnerStatus: string }
export interface NextEvent { timePassed: number; story: string; event: Pick<LifeEvent, "type" | "title" | "importance">; choices: LifeChoice[]; objectiveChanges: Partial<ObjectiveChanges>; psychologicalObservation?: Record<string, string>; memory?: string; usage?: ModelUsage }
export interface ModelUsage { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number; provider: string; model: string; fallbackReason?: string; promptCacheHitTokens?: number; promptCacheMissTokens?: number }

const cities = ["深圳", "上海", "北京", "杭州", "成都", "广州", "南京", "武汉", "西安", "重庆", "苏州", "天津"];

function randomCity(random: () => number = Math.random) {
  return cities[Math.floor(random() * cities.length)] ?? cities[0];
}

// 年度基础死亡率（近似真实生命表量级），随年龄上升。
function baseMortalityRate(age: number): number {
  if (age < 20) return 0.0008;
  if (age < 30) return 0.001;
  if (age < 40) return 0.0016;
  if (age < 50) return 0.003;
  if (age < 60) return 0.007;
  if (age < 70) return 0.018;
  if (age < 80) return 0.045;
  if (age < 90) return 0.11;
  return 0.25;
}

const ACCIDENT_CHANCE_PER_YEAR = 0.0004;

export function computeDeathChance(state: LifeState, timePassed: number): number {
  const age = state.basic.age;
  const base = baseMortalityRate(age);
  const physical = state.health.physical;
  const healthMultiplier = physical <= 20 ? 5 : physical <= 40 ? 2.5 : physical <= 60 ? 1.5 : 1;
  const conditionsRisk = Math.min(0.15, state.health.conditions.length * 0.02);
  const hazard = Math.min(0.9, base * healthMultiplier + conditionsRisk);
  return 1 - Math.pow(1 - hazard, Math.max(1, timePassed));
}

export function computeAccidentChance(timePassed: number): number {
  return 1 - Math.pow(1 - ACCIDENT_CHANCE_PER_YEAR, Math.max(1, timePassed));
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
    history: [], majorMemories: [], flags: {}, dead: false, createdAt: new Date().toISOString(),
  };
}

// applyNextEvent 把一次模型事件推进到状态里：
// - 玩家本次选择（choice）挂到“给出该选择”的上一个节点上（history 末尾的待定节点），
//   而不是挂到本节点，消除时间轴上决策错位一格的问题；
// - 新节点以“待定”状态入列（choiceId/choiceText 暂缺），等玩家做出选择后由下一次调用补齐；
// - 开局节点（start 路由，无 choice + rollDeath:false）同样以待定节点入列，不再丢失。
export function applyNextEvent(state: LifeState, event: NextEvent, choice?: LifeChoice, options: { random?: () => number; rollDeath?: boolean } = {}): LifeState {
  const changes = event.objectiveChanges ?? {};
  const age = Math.min(110, state.basic.age + Math.max(1, event.timePassed || 1));
  const next: LifeState = structuredClone(state);
  next.basic.age = age;
  if (changes.occupation) next.career.occupation = changes.occupation;
  if (typeof changes.incomeYearly === "number") next.career.incomeYearly = Math.max(0, changes.incomeYearly);
  if (typeof changes.cash === "number") next.finance.cash = Math.max(0, next.finance.cash + changes.cash);
  if (typeof changes.assets === "number") next.finance.assets = Math.max(0, next.finance.assets + changes.assets);
  if (typeof changes.debt === "number") next.finance.debt = Math.max(0, next.finance.debt + changes.debt);
  if (typeof changes.physical === "number") next.health.physical = Math.max(0, Math.min(100, next.health.physical + changes.physical));
  if (changes.partnerStatus) next.relationships.partner.status = changes.partnerStatus;
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
    choices: event.choices ?? [],
    importance: event.event.importance,
    memory: event.memory,
    objectiveChanges: changes,
    storedAt: new Date().toISOString(),
    usage: event.usage,
  };
  next.history.push(record);
  // 兜底：直接调用方（无待定决策节点可挂，如单次生成）把选择挂到本节点上，保持旧语义。
  if (!choiceAttached && choice?.id && choice.id !== "none" && choice.text) {
    record.choiceId = choice.id;
    record.choiceText = choice.text;
  }
  if (event.memory && event.event.importance >= 0.65) next.majorMemories.push(event.memory);
  if (!next.dead && options.rollDeath !== false) {
    const random = options.random ?? Math.random;
    if (next.health.physical <= 0) {
      next.dead = true;
      next.flags.deathCause = "disease";
    } else if (next.basic.age >= 95) {
      next.dead = true;
      next.flags.deathCause = "age";
    } else if (random() < computeAccidentChance(event.timePassed || 1)) {
      next.dead = true;
      next.flags.deathCause = "accident";
    } else if (random() < computeDeathChance(next, event.timePassed || 1)) {
      next.dead = true;
      next.flags.deathCause = next.health.physical <= 40 ? "disease" : "natural";
    }
  }
  return next;
}

const DEATH_CAUSE_LABEL: Record<string, string> = {
  natural: "自然离世",
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
