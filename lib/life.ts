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
export interface LifeEvent {
  id: string;
  age: number;
  type: EventType;
  title: string;
  story: string;
  choiceId?: string;
  choiceText?: string;
  importance: number;
  memory?: string;
  objectiveChanges?: Partial<ObjectiveChanges>;
}
export interface ObjectiveChanges { incomeYearly: number; cash: number; assets: number; debt: number; physical: number; occupation: string; partnerStatus: string }
export interface NextEvent { timePassed: number; story: string; event: Pick<LifeEvent, "type" | "title" | "importance">; choices: LifeChoice[]; objectiveChanges: Partial<ObjectiveChanges>; psychologicalObservation?: Record<string, string>; memory?: string; usage?: ModelUsage }
export interface ModelUsage { promptTokens: number; completionTokens: number; totalTokens: number; estimatedCostUsd: number; provider: string; model: string; fallbackReason?: string }

const cities = ["深圳", "上海", "北京", "杭州", "成都"];

export function createStarterLife(input: Partial<LifeBasics> = {}): LifeState {
  const lifeId = crypto.randomUUID();
  return {
    lifeId,
    basic: { age: input.age ?? 0, gender: input.gender ?? "unspecified", city: input.city ?? cities[0], education: input.education ?? "未开始" },
    career: { occupation: "婴儿", companyType: "家庭", incomeYearly: 0, careerStage: "childhood" },
    finance: { cash: 8000, assets: 8000, debt: 0, housing: "与家人同住" },
    health: { physical: 92, conditions: [], lifestyle: "普通" },
    relationships: { partner: { status: "单身", years: 0 }, children: [], parents: { status: "健在" }, friends: [] },
    psychology: { valueProfile: {}, behaviorPatterns: [], internalConflicts: [] },
    history: [], majorMemories: [], flags: {}, dead: false, createdAt: new Date().toISOString(),
  };
}

export function applyNextEvent(state: LifeState, event: NextEvent, choice: LifeChoice): LifeState {
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
  const record: LifeEvent = { id: crypto.randomUUID(), age, type: event.event.type, title: event.event.title, story: event.story, choiceId: choice.id, choiceText: choice.text, importance: event.event.importance, memory: event.memory, objectiveChanges: changes };
  next.history.push(record);
  if (event.memory && event.event.importance >= 0.65) next.majorMemories.push(event.memory);
  if (age >= 88 || next.health.physical <= 0) next.dead = true;
  return next;
}

export function buildEnding(state: LifeState) {
  const highlights = state.history.filter((event) => event.importance >= 0.65).slice(-8);
  return { age: state.basic.age, facts: { occupation: state.career.occupation, city: state.basic.city, events: state.history.length, majorMemories: state.majorMemories }, highlights, patterns: state.psychology.behaviorPatterns.length ? state.psychology.behaviorPatterns : ["你在一次次选择中，逐渐形成了自己的生活节奏。"], question: "如果可以再活一次，你会做出不同的选择吗？" };
}
