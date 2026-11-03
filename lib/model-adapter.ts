import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./engine/prompts/assemble";
export { buildSystemPrompt, CHILDHOOD_SYSTEM_PROMPT } from "./engine/prompts/assemble";
export type { SystemPromptOptions } from "./engine/prompts/assemble";
import type { LifeState, LifeChoice, LifeEvent, NextEvent, ModelUsage, LifeEnding } from "./life";
import { getProvider, resolveProviderModel } from "./provider-catalog";
import { getModelConfigMode, resolveStoredModelConfig } from "./model-config";
import { flagsToBackground } from "./background";
import { detectStorylineDomains, leftStorylines, parseAvoidStorylines, storylineLabel, type StorylineGuards } from "./storyline";
import {
  buildScenarioFallbackEvent,
  buildScenarioReviewDirective,
  buildThemeTurnHint,
  getLifeScenario,
  getScenarioReviewQuestion,
} from "./modes/scenario";
import type { LifeScenario } from "./modes/types";
import { DEATH_CAUSE_LABEL } from "./life";




const occupations = ["产品经理", "软件工程师", "教师", "设计师", "研究员"];
export const CHILDHOOD_BOUNDARY = 15;
export const MODEL_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_MODEL_ATTEMPTS = 3;
// 首 token 看门狗：超过该时长模型还没开始输出，判定为卡住，快速失败重试（不等满 60 秒）。
export const FIRST_TOKEN_TIMEOUT_MS = 25_000;

// 童年节点落地后是否跨入成年（≥15 岁）。判定"该不该给选项"必须用落地年龄，
// 否则会出现"14 岁生成、落到 17 岁却仍是纯叙事节点"的边界错位（17 岁拿不到任何决策）。
export function crossesAdulthoodBoundary(stateAge: number, timePassed: number): boolean {
  return stateAge < CHILDHOOD_BOUNDARY && stateAge + Math.max(1, timePassed) >= CHILDHOOD_BOUNDARY;
}

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
}

function logModelDiagnostic(context: string, fields: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  const safe = { ...fields };
  if (typeof safe.raw === "string") safe.raw = safe.raw.slice(0, 800);
  console.warn(`[model-diagnostic] ${context} ${JSON.stringify(safe)}`);
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") return new ModelError("模型响应超时（超过 60 秒），请稍后重试或更换模型");
  return new ModelError(error instanceof Error ? `模型请求失败：${error.message}` : "模型请求失败");
}

export interface ModelConfig {
  providerId: string;
  apiKey: string;
  model: string;
}

interface ResolvedModelConfig extends ModelConfig {
  baseUrl: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

type EnvConfig = Record<string, string | undefined>;

function finiteOrZero(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function resolveModelConfig(config?: Partial<ModelConfig>, env: EnvConfig = process.env): ResolvedModelConfig {
  const configuredMode = getModelConfigMode(env);
  const storedConfig = configuredMode === "local" ? resolveStoredModelConfig(env) : undefined;
  const hasEnvironmentConfig = Boolean((env.LLM_API_KEY || env.OPENAI_API_KEY || env.LLM_MODEL || env.OPENAI_MODEL)?.trim());
  const mode = configuredMode === "local" && !storedConfig && hasEnvironmentConfig && !env.FINDJOY_MODEL_CONFIG_MODE ? "environment" : configuredMode;
  const activeConfig = storedConfig ?? (mode === "local" && !hasEnvironmentConfig ? config : undefined);
  const providerModel = activeConfig?.providerId ? resolveProviderModel(activeConfig.providerId, activeConfig.model) : undefined;
  const requestedModel = typeof activeConfig?.model === "string" && activeConfig.model.trim() ? activeConfig.model.trim() : undefined;
  const pricingModel = mode === "local" ? providerModel : (config?.providerId ? resolveProviderModel(config.providerId, config.model) : undefined);
  const pricingRequestedModel = mode === "local" ? requestedModel : (typeof config?.model === "string" && config.model.trim() ? config.model.trim() : undefined);
  const fixedModel = (env.LLM_MODEL || env.OPENAI_MODEL || "").trim();
  return {
    apiKey: mode === "local" ? (activeConfig?.apiKey || env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim() : (env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim(),
    providerId: mode === "local" && providerModel ? providerModel.providerId : "environment",
    baseUrl: mode === "local" && providerModel ? providerModel.baseUrl : (env.LLM_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, ""),
    model: mode === "environment" ? fixedModel || "gpt-4o-mini" : requestedModel || providerModel?.model || fixedModel || "gpt-4o-mini",
    inputCostPerMillion: pricingModel && pricingRequestedModel === pricingModel.model ? pricingModel.inputCostPerMillion : (pricingModel ? 0 : finiteOrZero(env.LLM_INPUT_COST_PER_MILLION)),
    outputCostPerMillion: pricingModel && pricingRequestedModel === pricingModel.model ? pricingModel.outputCostPerMillion : (pricingModel ? 0 : finiteOrZero(env.LLM_OUTPUT_COST_PER_MILLION)),
  };
}

export function sanitizeModelConfig(value: unknown): Partial<ModelConfig> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const provider = typeof input.providerId === "string" ? getProvider(input.providerId) : undefined;
  const model = provider && typeof input.model === "string" && input.model.trim() ? input.model.trim().slice(0, 200) : provider?.models[0].id;
  return {
    providerId: provider?.id,
    apiKey: typeof input.apiKey === "string" ? input.apiKey.slice(0, 500) : undefined,
    model,
  };
}

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

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

// 只匹配明确的命名句式（名叫/名字叫/名字是/名为/叫作/叫做/姓名），
// 避免把“说出自己的名字”“报名字”这类自我介绍叙述误判为给人物起名，也避免“叫外卖”动词误杀。
function containsNameInstruction(value: string) {
  return /(?:名叫|名字叫|名字是|名为|叫作|叫做|姓名)[：:\s]*[\u4e00-\u9fffA-Za-z]{1,12}/u.test(value);
}

const EVENT_TYPES = ["career", "relationship", "health", "finance", "random", "family"] as const;

// 模型偶尔会用中文或同义词写 event.type（事业/家庭/健康…）。
// 对无歧义的别名做模糊映射，把"类型写错"从"整轮重试"降级为"自动纠正"；
// 完全未知的值仍严格失败，保持硬契约精神。
const EVENT_TYPE_ALIASES: Record<string, (typeof EVENT_TYPES)[number]> = {
  career: "career", 职业: "career", 事业: "career", 工作: "career", 学业: "career", 职场: "career", 求学: "career",
  relationship: "relationship", 关系: "relationship", 情感: "relationship", 爱情: "relationship", 感情: "relationship", 人际: "relationship", 婚恋: "relationship", 社交: "relationship", 友情: "relationship",
  family: "family", 家庭: "family", 家人: "family", 家族: "family", 亲情: "family",
  health: "health", 健康: "health", 身体: "health", 疾病: "health", 医疗: "health", 病痛: "health", 生病: "health",
  finance: "finance", 财务: "finance", 金钱: "finance", 经济: "finance", 财富: "finance", 收入: "finance", 资产: "finance", 债务: "finance",
  random: "random", 随机: "random", 意外: "random", 其他: "random", 其它: "random", 命运: "random", 无常: "random",
};

function normalizeEventType(value: unknown): (typeof EVENT_TYPES)[number] | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if ((EVENT_TYPES as readonly string[]).includes(key)) return key as (typeof EVENT_TYPES)[number];
  return EVENT_TYPE_ALIASES[key];
}

function normalizeChoiceId(id: string, fallback: string): string {
  const cleaned = id.trim().replace(/^(选项|option)\s*/i, "").toUpperCase();
  return /^[A-Z0-9]{1,3}$/.test(cleaned) ? cleaned : fallback;
}

function normalizeChoices(value: unknown): LifeChoice[] {
  const entries: Array<Record<string, unknown>> = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) entries.push({ text: item });
      else if (item && typeof item === "object") entries.push(item as Record<string, unknown>);
    }
  } else if (value && typeof value === "object") {
    // 兼容对象写法 {"A":"选项一","B":"选项二"}
    for (const [id, text] of Object.entries(value as Record<string, unknown>)) entries.push({ id, text });
  }
  // 修复常见的选项格式瑕疵（缺 id / text 用了 option、label / 纯字符串 / 选项A 这类 id），
  // 把"格式小错"从整轮重试降级为自动纠正；真正凑不出 2 个有效选项仍由契约把关。
  const letters = ["A", "B", "C", "D"];
  const used = new Set<string>();
  const choices: LifeChoice[] = [];
  for (const entry of entries) {
    const text = [entry.text, entry.option, entry.label].find((item): item is string => typeof item === "string" && Boolean(item.trim()))?.trim() ?? "";
    if (!text) continue;
    let id = typeof entry.id === "string" && entry.id.trim() ? normalizeChoiceId(entry.id, "") : "";
    if (!id || used.has(id)) {
      id = letters.find((letter) => !used.has(letter)) ?? `X${choices.length + 1}`;
    }
    used.add(id);
    choices.push({ id, text });
    if (choices.length >= 3) break;
  }
  return choices;
}

// 价值张力轴检测：把一组选项归类到它所对抗的价值轴（如“闯荡/留守、理性/感性、服从/反叛…”）。
// 用于“相邻节点不得使用同一条张力轴”的硬契约，阻止模型反复套用“闯出去/留守/折中”同一套模板。
// 返回主导张力轴的 key（如 "闯荡/留守"），检测不出明显对抗时返回 null（不触发该契约）。
interface ValueAxis { key: string; poles: [RegExp, RegExp] }
const VALUE_AXES: ValueAxis[] = [
  { key: "闯荡/留守", poles: [/闯|出去|外地|大城市|打拼|拼一把|赌一把|闯荡|搏|创业|开店|追梦|追|更大的|见世面|闯一闯/, /留守|留在家|本地|照顾家里|顾家|早工作|减轻家里|安稳|稳定|陪在父母|家里|安家|省钱|托付/] },
  { key: "理性/感性", poles: [/理性|理智|分析|利弊|数据|现实|稳妥|靠谱|计算|权衡/, /感性|感觉|直觉|热爱|心动|喜欢|感情|冲动|随性/] },
  { key: "服从/反叛", poles: [/听.{0,3}(父母|家里|老师|家人)|按.{0,4}安排|服从|接受安排|顺着|按部就班/, /反叛|反抗|不听话|坚持自己|自己做主|闹翻|违抗|逆着/] },
  { key: "短利/长利", poles: [/眼前|当下|短期|尽快|快钱|立刻|马上|省事|现成|先赚/, /长远|长期|未来|积累|沉淀|一辈子|打基础|厚积|一劳永逸|走长远/] },
  { key: "向内/向外", poles: [/独处|独自|安静|内敛|自己|一个人的|沉默|低调|向内|躲/, /交朋友|社交|人脉|走出去|认识|结伴|加入|融入|外向|主动接近/] },
  { key: "守成/创新", poles: [/维持|保持现状|守住|不折腾|照旧|现状|稳妥|守成|稳扎稳打/, /创新|突破|转型|尝试新|变革|探索|开辟|开创|试水|扩充/] },
  { key: "独行/合作", poles: [/自己|独自|单干|一个人扛|自己扛/, /合作|合伙|团队|找人|一起|分担|结盟|联手|入股/] },
  { key: "名声/自由", poles: [/名声|名气|认可|荣誉|奖项|头衔|地位|别人眼|出名|影响力/, /自由|自在|随心|不被束缚|不被安排|做自己|无拘/] },
  { key: "合群/独立", poles: [/合群|随大流|跟大家|融入|别人都一样/, /独立|独来独往|不合群|做自己/] },
  { key: "逃避/面对", poles: [/逃避|回避|躲|拖着|放着不管|不去想|算了/, /面对|直面|正视|承担|面对现实|扛|处理/] },
];

// 取历史里最近一个有 choices 的节点（即上一轮给过玩家的决策节点），
// 用于把它的价值张力轴作为本轮“不得重复”的参照。
export function lastChoiceNode(state: Pick<LifeState, "history">): Pick<LifeEvent, "choices"> | undefined {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const node = state.history[i];
    if (node.choices && node.choices.length >= 2) return node;
  }
  return undefined;
}
export function detectValueAxis(choices: LifeChoice[] | undefined): string | null {
  if (!choices || choices.length === 0) return null;
  let best: { key: string; score: number } | null = null;
  for (const axis of VALUE_AXES) {
    let hitsA = 0;
    let hitsB = 0;
    for (const choice of choices) {
      if (axis.poles[0].test(choice.text)) hitsA += 1;
      if (axis.poles[1].test(choice.text)) hitsB += 1;
    }
    if (hitsA > 0 && hitsB > 0) {
      const score = hitsA + hitsB;
      if (!best || score > best.score) best = { key: axis.key, score };
    }
  }
  return best?.key ?? null;
}

function normalizeObjectiveChanges(value: unknown): NextEvent["objectiveChanges"] {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const pick = <K extends keyof NextEvent["objectiveChanges"]>(key: K) => (typeof input[key] === "number" ? input[key] : typeof input[camelToSnake(key) as K] === "number" ? input[camelToSnake(key) as K] : undefined);
  return {
    incomeYearly: pick("incomeYearly") as number | undefined,
    cash: pick("cash") as number | undefined,
    assets: pick("assets") as number | undefined,
    debt: pick("debt") as number | undefined,
    physical: pick("physical") as number | undefined,
    occupation: typeof input.occupation === "string" ? input.occupation : undefined,
    partnerStatus: typeof input.partnerStatus === "string" ? input.partnerStatus : undefined,
  };
}

function camelToSnake(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// 容错解析：response_format json_object 保证语法，但个别供应商可能忽略该参数，
// 模型也可能输出 Markdown 围栏、在 JSON 前后夹带文字，或被 max_tokens 截断。
// 依次尝试：原样 → 去围栏 → 截取首个 { 到末尾 }，全部失败才抛错进入重试。
export function parseGeneratedJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* try the next candidate */ }
  }
  throw new ModelError("模型返回内容无法解析为 JSON");
}

// 截断修复：max_tokens 或供应商截断导致 JSON 未闭合时，补全未闭合字符串与括号后再解析。
// 消除"输出被截断 → 整轮重试"这一类失败。
export function repairTruncatedJson(text: string): string {
  let s = (text ?? "").trim();
  if (!s) return s;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") {
      const open = stack.pop();
      if ((ch === "}" && open !== "{") || (ch === "]" && open !== "[")) return text; // 结构已乱，放弃修复
    }
  }
  if (inString) s += '"'; // 补全未闭合字符串
  s = s.replace(/[,\s]+$/, ""); // 去掉尾部悬空逗号
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === "{" ? "}" : "]"; // 按栈补全闭合
  return s;
}

// 解析失败后先尝试截断修复，仍失败才抛错进入重试。
function parseWithTruncationRepair(text: string): unknown {
  try {
    return parseGeneratedJson(text);
  } catch {
    return parseGeneratedJson(repairTruncatedJson(text));
  }
}

// 重试时给模型带回失败原因，避免"同样的错再犯一遍"（盲重试）。
// guidance 按场景给出该契约的字段要点。
function withRetryCorrection(attempt: number, messages: NextEventMessage[], failureReason: string, guidance: string): NextEventMessage[] {
  if (attempt === 1 || !failureReason) return messages;
  return [
    ...messages,
    { role: "user", content: `你上一轮输出的 JSON 未通过校验：${failureReason}。请直接重新输出一个完全合规的 JSON 对象：不要 Markdown 代码块、不要任何解释或多余文字。${guidance}` },
  ];
}

// 从生成的 JSON 里提取"职业载体"主线域：occupation 变化 + career 事件的标题。
// 只认职业信号，不扫 story/choices——"妈妈住院"的家庭剧情、业余爱好都不会被误判为主线。
function generatedStorylineDomains(candidate: Record<string, unknown>): string[] {
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  const type = event ? normalizeEventType(event.type) : undefined;
  if (!type || !event) return [];
  const changes = (candidate.objectiveChanges && typeof candidate.objectiveChanges === "object"
    ? candidate.objectiveChanges as Record<string, unknown>
    : candidate.objective_changes && typeof candidate.objective_changes === "object"
      ? candidate.objective_changes as Record<string, unknown>
      : {});
  const texts: string[] = [];
  if (typeof changes.occupation === "string" && changes.occupation.trim()) texts.push(changes.occupation);
  if (type === "career" && typeof event.title === "string") texts.push(event.title);
  return detectStorylineDomains(texts);
}

// 诊断哪一道契约关卡失败：返回 null 表示通过，否则返回具体原因。
// expectChoices=false 表示童年阶段，不要求 choices 字段。
// previousChoices=上一个节点的选项，用于“相邻节点张力轴不得相同”的轮换硬约束。
// storylineGuards=题材域层防重守卫（跨人生 avoidStorylines / 单局内 leftStorylines）。
export function diagnoseGeneratedEvent(value: unknown, expectChoices = true, previousChoices?: LifeChoice[] | undefined, storylineGuards?: StorylineGuards): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  if (!event) return "缺少 event 对象";
  if (typeof candidate.story !== "string" || !candidate.story.trim()) return "story 缺失或为空";
  if (typeof event.title !== "string" || !event.title.trim()) return "event.title 缺失或为空";
  if (!normalizeEventType(event.type)) return "event.type 非法：" + String(event.type) + "（应为 career/relationship/health/finance/random/family 之一）";
  if (expectChoices && normalizeChoices(candidate.choices).length < 2) return "choices 少于 2 个有效选项（每项需 id + 非空 text）";
  if (expectChoices) {
    const currentAxis = detectValueAxis(normalizeChoices(candidate.choices));
    const previousAxis = detectValueAxis(previousChoices);
    if (currentAxis && previousAxis && currentAxis === previousAxis) {
      return "价值张力轴与上一节点重复（都是\"" + currentAxis + "\"）。相邻节点必须换一条价值轴：上一节点已是\"" + currentAxis + "\"，本次请改用其它张力轴（如理性/感性、服从/反叛、短利/长利、向内/向外、守成/创新、独行/合作、名声/自由、合群/独立、逃避/面对等），不要再用\"闯出去/留守/折中\"同套模板。";
    }
  }
  // 题材域层防重（第三层硬契约）：跨人生主线与本局已离开方向都不得再进入。
  const generatedStorylines = generatedStorylineDomains(candidate);
  if (storylineGuards?.avoidStorylines && storylineGuards.avoidStorylines.length > 0) {
    const hit = generatedStorylines.find((domain) => storylineGuards!.avoidStorylines!.includes(domain));
    if (hit) return "题材与最近一局人生主线重复（" + storylineLabel(hit) + "）。最近几局已经走过" + storylineGuards.avoidStorylines.map(storylineLabel).join("、") + "，本局不要再进入这些题材，请换一个完全不同的方向。";
  }
  if (storylineGuards?.leftStorylines && storylineGuards.leftStorylines.length > 0) {
    const hit = generatedStorylines.find((domain) => storylineGuards!.leftStorylines!.includes(domain));
    if (hit) return "又回到了本局已经离开的方向（" + storylineLabel(hit) + "）。你在这局人生里已经走过" + storylineGuards.leftStorylines.map(storylineLabel).join("、") + "并已离开，不要再回头进入这些题材；可以继续当前职业，也可以转向全新的方向。";
  }
  const texts = [candidate.story, candidate.memory, event.title, ...normalizeChoices(candidate.choices).map((item) => item.text)]
    .filter((item): item is string => typeof item === "string");
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：任何关键字段缺失、类型非法、含姓名指示词或张力轴重复都返回 null，调用方抛错。
export function normalizeGeneratedEvent(value: unknown, expectChoices = true, previousChoices?: LifeChoice[] | undefined, storylineGuards?: StorylineGuards): NextEvent | null {
  if (diagnoseGeneratedEvent(value, expectChoices, previousChoices, storylineGuards) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event as Record<string, unknown>;
  const story = (candidate.story as string).trim();
  const title = (event.title as string).trim();
  const type = (normalizeEventType(event.type) ?? EVENT_TYPES[0]) as NextEvent["event"]["type"];
  const choices = expectChoices ? normalizeChoices(candidate.choices) : [];
  return {
    timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || 1)),
    story,
    event: { type, title, importance: Math.max(0, Math.min(1, num(event?.importance) || 0.6)) },
    choices,
    objectiveChanges: normalizeObjectiveChanges(candidate.objectiveChanges ?? candidate.objective_changes),
    memory: typeof candidate.memory === "string" && candidate.memory.trim() ? candidate.memory.trim() : undefined,
  };
}

// 选项补齐池：模型只给出 1 个或 0 个有效选项时，按事件类型补足 2~3 个，
// 保证玩家始终有得选，避免为"选项数量不足"反复重试。
const FILL_CHOICES: Record<string, string[]> = {
  career: ["接受眼前的这个机会", "再观望一段时间，想清楚再动", "按自己的节奏来，不被推着走"],
  relationship: ["认真回应这份心意，把话说明白", "先保持距离，再相处一段时间看看", "坦诚说出自己的顾虑"],
  health: ["立刻去检查，把身体放在第一位", "先调整作息，观察一阵再决定", "咨询专业的人，别自己扛"],
  finance: ["保守一点，先稳住手里的", "留一部分，拿一部分去试试", "找懂行的人问清楚再决定"],
  family: ["把家人叫到一起，把话说开", "先稳住自己，再照顾大家", "按自己的想法来，但和家人说明白"],
  random: ["顺着这个变化往前走", "停下来想想再决定", "把这次变化当成一次机会"],
};

// 修复层：严格契约不过时，把可修复的问题就地解决（不再重试）：
// - choices 不足 2 个 → 自动补齐
// - 价值张力轴重复 → 接受（轮换改为下一轮提示词预防，见 buildSystemPrompt 的 avoidAxis）
// 不可修复的问题（核心字段缺失、含姓名指示词）返回 null，仍走重试。
export function repairGeneratedEvent(value: unknown, expectChoices: boolean, storylineGuards?: StorylineGuards): NextEvent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  if (!event) return null;
  if (typeof candidate.story !== "string" || !candidate.story.trim()) return null;
  if (typeof event.title !== "string" || !event.title.trim()) return null;
  const type = normalizeEventType(event.type);
  if (!type) return null;
  const texts = [candidate.story, candidate.memory, event.title].filter((item): item is string => typeof item === "string");
  if (texts.some(containsNameInstruction)) return null;
  // 题材冲突不可修复（修复层只解决格式问题）：命中跨局防重或单局内防重的主线 → 返回 null 走重试。
  if (storylineGuards && ((storylineGuards.avoidStorylines?.length ?? 0) > 0 || (storylineGuards.leftStorylines?.length ?? 0) > 0)) {
    const hit = generatedStorylineDomains(candidate).find((domain) => (storylineGuards.avoidStorylines?.includes(domain) ?? false) || (storylineGuards.leftStorylines?.includes(domain) ?? false));
    if (hit) return null;
  }
  const choices = normalizeChoices(candidate.choices);
  if (expectChoices) {
    const pool = FILL_CHOICES[type] ?? FILL_CHOICES.random;
    const letters = ["A", "B", "C"].filter((letter) => !choices.some((item) => item.id === letter));
    let poolIndex = 0;
    while (choices.length < 3 && letters.length > 0) {
      choices.push({ id: letters.shift() as string, text: pool[poolIndex % pool.length] });
      poolIndex += 1;
    }
  }
  return {
    timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || 1)),
    story: (candidate.story as string).trim(),
    event: { type, title: (event.title as string).trim(), importance: Math.max(0, Math.min(1, num(event?.importance) || 0.6)) },
    choices: expectChoices ? choices.slice(0, 3) : [],
    objectiveChanges: normalizeObjectiveChanges(candidate.objectiveChanges ?? candidate.objective_changes),
    memory: typeof candidate.memory === "string" && candidate.memory.trim() ? candidate.memory.trim() : undefined,
  };
}

export type ModelStreamChunk = { text?: string; retry?: boolean; reason?: string };

// 持久化的对话转录：每轮请求 = [system, ...转录, user(本轮)]，纯追加式。
// 这样每一轮请求的输入都是上一轮请求输入的严格前缀，DeepSeek 上下文缓存
// 在“请求边界”持久化的缓存单元会被下一轮完整命中（官方多轮对话示例的命中模式）。
export interface TranscriptMessage {
  role: "user" | "assistant";
  content: string;
}

export function buildModelPrompt(state: LifeState, choice?: LifeChoice) {
  // 旧式单条提示词（无转录的存档/兜底路径）：
  // 字段严格按“稳定在前、易变在后”排列，最大化 DeepSeek 前缀上下文缓存命中率：
  // - life / personality / major_memories 在本局内基本不变；history 是追加式数组，前缀逐轮保持字节级一致；
  // - 只有尾部的 current_state 与 current_choice 每轮变化。
  // 注意：不要把易变字段（age、career、finance…）插入到中部，否则会从那里切断可缓存的公共前缀。
  return JSON.stringify({
    life: {
      id: state.lifeId,
      gender: state.basic.gender,
      city: state.basic.city,
      education: state.basic.education,
      created_at: state.createdAt,
      scenario: state.scenario,
    },
    personality: {
      value_profile: state.psychology.valueProfile,
      behavior_patterns: state.psychology.behaviorPatterns,
      internal_conflicts: state.psychology.internalConflicts,
    },
    major_memories: state.majorMemories,
    history: state.history,
    current_state: {
      age: state.basic.age,
      gender: state.basic.gender,
      career: state.career,
      finance: state.finance,
      health: state.health,
      relationships: state.relationships,
      flags: state.flags,
      dead: state.dead,
    },
    current_choice: choice ?? null,
  });
}

// 转录模式下每轮 user 消息的内容：只有当前状态快照 + 本轮选择（每轮都会变，属于缓存 miss 部分）。
// includeIdentity=true 仅用于开局第一轮，把固定身份/性格/记忆写入转录，之后不再重复发送。
export function buildTranscriptUserContent(state: LifeState, choice?: LifeChoice, includeIdentity = false) {
  const payload: Record<string, unknown> = {};
  if (includeIdentity) {
    payload.life = {
      id: state.lifeId,
      gender: state.basic.gender,
      city: state.basic.city,
      education: state.basic.education,
      created_at: state.createdAt,
      scenario: state.scenario,
    };
    payload.personality = {
      value_profile: state.psychology.valueProfile,
      behavior_patterns: state.psychology.behaviorPatterns,
      internal_conflicts: state.psychology.internalConflicts,
    };
    payload.major_memories = state.majorMemories;
  }
  payload.current_state = {
    age: state.basic.age,
    gender: state.basic.gender,
    career: state.career,
    finance: state.finance,
    health: state.health,
    relationships: state.relationships,
    flags: state.flags,
    dead: state.dead,
  };
  payload.current_choice = choice ?? null;
  return JSON.stringify(payload);
}

// 转录里 assistant 消息的内容：模型产出的规范化事件（去掉 usage 等请求无关字段），字节固定。
export function serializeTranscriptEvent(event: NextEvent): string {
  return JSON.stringify({
    timePassed: event.timePassed,
    story: event.story,
    event: event.event,
    choices: event.choices,
    objectiveChanges: event.objectiveChanges,
    memory: event.memory,
  });
}

export type NextEventMessage = { role: "system" | "user" | "assistant"; content: string };

// transcript 语义：
// - null/undefined → 旧式单条提示词（旧存档或非转录调用方，如 generateNextEvent）
// - []            → 新人生开局第一轮，user 消息携带固定身份（后续存入转录）
// - 非空          → 追加式转录：请求 = [system, ...转录, user(本轮状态+选择)]
export function buildNextEventMessages(
  systemPrompt: string,
  state: LifeState,
  choice: LifeChoice | undefined,
  transcript: TranscriptMessage[] | null | undefined,
): NextEventMessage[] {
  if (transcript === null || transcript === undefined) {
    return [{ role: "system", content: systemPrompt }, { role: "user", content: buildModelPrompt(state, choice) }];
  }
  return [
    { role: "system", content: systemPrompt },
    ...transcript,
    { role: "user", content: buildTranscriptUserContent(state, choice, transcript.length === 0) },
  ];
}

export async function* streamNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>, transcript?: TranscriptMessage[] | null): AsyncGenerator<ModelStreamChunk, NextEvent> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  // 从 14 岁起直接进入决策阶段：下一次跳跃（timePassed ≥ 1）必然落地 ≥15 岁，
  // 因此迈入点直接用决策提示词生成带选项的事件，不需要先出童年事件再重生成。
  const scenario = getLifeScenario(state);
  const isOpening = state.history.length === 0;
  const openingAtCurrentAge = isOpening && (scenario.mode === "script" || scenario.mode === "foru");
  // 剧本/ForU 从固定年龄/当前年龄开场，不再叠加随机出身档案；普通/主题沿用出身。
  const expectChoices = openingAtCurrentAge || state.basic.age + 1 >= CHILDHOOD_BOUNDARY;
  // 预防式张力轴轮换：把上一节点的张力轴写进本轮提示词，让模型主动避开（而不是写重复了再重试）
  const previousChoices = lastChoiceNode(state)?.choices;
  const avoidAxis = detectValueAxis(previousChoices);
  // 题材域层防重守卫：
  // - avoidStorylines（跨人生防重）：开局时写入 flags.avoidStorylines（最近几局主线），本局固定；
  // - leftStorylines（单局内防重）：本局已确立且已离开的方向，逐轮动态计算。
  // 剧本/ForU 的走向由情境决定；主题的主线由主题提醒负责，三者都不应被
  // 跨局/局内题材防重拉离情境。只有普通人生保留完整防重。
  const storylineGuards: StorylineGuards | undefined = (() => {
    if (scenario.mode !== "normal") return undefined;
    const avoidStorylines = parseAvoidStorylines(state.flags.avoidStorylines);
    const left = leftStorylines(state);
    return avoidStorylines.length > 0 || left.length > 0 ? { avoidStorylines, leftStorylines: left } : undefined;
  })();
  let lastError: ModelError = new ModelError("模型请求失败");
  let lastFailureReason = "";
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let generatedText = "";
    let usageRaw: Record<string, unknown> = {};
    let controller: AbortController | undefined;
    let firstTokenSeen = false;
    try {
      const systemPrompt = buildSystemPrompt(expectChoices, {
        background: scenario.mode === "script" || scenario.mode === "foru" ? undefined : flagsToBackground(state.flags),
        transitioning: expectChoices && state.basic.age < CHILDHOOD_BOUNDARY && !openingAtCurrentAge,
        avoidAxis,
        storylineGuards,
        scenario,
        isOpening,
        themeHint: buildThemeTurnHint(scenario, state),
      });
      const messages = buildNextEventMessages(systemPrompt, state, choice, transcript);
      controller = new AbortController();
      // 首 token 看门狗：25 秒没开始输出就中断本轮，快速进入重试（避免干等 60 秒）
      const watchdog = setTimeout(() => { if (!firstTokenSeen) controller?.abort(); }, FIRST_TOKEN_TIMEOUT_MS);
      const overall = setTimeout(() => controller?.abort(), MODEL_REQUEST_TIMEOUT_MS);
      try {
        const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, signal: controller.signal, body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 4096, stream: true, stream_options: { include_usage: true }, response_format: { type: "json_object" }, messages: withRetryCorrection(attempt, messages, lastFailureReason, "字段严格按契约（camelCase，story 在前、event 在后，event.type 只用英文枚举 career/relationship/health/finance/random/family，choices 每项含 id 和非空 text）。") }) });
        if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
        if (!response.body) throw new ModelError("模型服务未返回内容");
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const blocks = buffer.split("\n\n");
          buffer = blocks.pop() ?? "";
          for (const block of blocks) {
            const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
            if (!data || data === "[DONE]") continue;
            try {
              const packet = JSON.parse(data) as {
                choices?: Array<{ delta?: { content?: string } }>;
                usage?: Record<string, unknown>;
              };
              const content = packet.choices?.[0]?.delta?.content;
              if (typeof content === "string") {
                firstTokenSeen = true;
                generatedText += content;
                yield { text: content };
              }
              if (packet.usage && typeof packet.usage === "object") usageRaw = packet.usage;
            } catch { /* Ignore malformed keepalive frames. */ }
          }
        }
      } finally {
        clearTimeout(watchdog);
        clearTimeout(overall);
      }
      const generated = parseWithTruncationRepair(generatedText || "{}");
      // 修复优先：先走严格契约；不过则尝试就地修复（补齐选项/接受张力轴重复），
      // 只有不可修复的问题（核心字段缺失、含姓名）才进入重试。
      let parsed = normalizeGeneratedEvent(generated, expectChoices, previousChoices, storylineGuards);
      let reason: string | null = null;
      if (!parsed) {
        reason = diagnoseGeneratedEvent(generated, expectChoices, previousChoices, storylineGuards);
        parsed = repairGeneratedEvent(generated, expectChoices, storylineGuards);
      }
      if (!parsed) {
        logModelDiagnostic("event-contract-fail", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", attempt, reason: reason ?? "事件契约未通过且无法自动修复", raw: generatedText });
        throw new ModelError(`模型返回内容未满足${expectChoices ? "事件" : "童年"}契约：${reason ?? "无法自动修复"}`);
      }
      if (!expectChoices && crossesAdulthoodBoundary(state.basic.age, parsed.timePassed)) {
        // 安全兜底：童年提示词要求落地 <15 岁，若模型仍越界，硬钳制落地到 14 岁（不重生成）。
        // 正常路径下从 14 岁起已切到决策提示词，这里只防模型违规。
        parsed.timePassed = CHILDHOOD_BOUNDARY - 1 - state.basic.age;
        logModelDiagnostic("childhood-landing-clamped", { age: state.basic.age, clampedTo: CHILDHOOD_BOUNDARY - 1 });
      }
      // 剧本/ForU 第一幕必须落在当前年龄；后续节点把节奏收紧到 1~5 年。
      if (openingAtCurrentAge) parsed.timePassed = 0;
      else if (scenario.mode === "script" || scenario.mode === "foru") parsed.timePassed = Math.min(5, Math.max(1, parsed.timePassed));
      const usage: ModelUsage = { promptTokens: num(usageRaw.prompt_tokens), completionTokens: num(usageRaw.completion_tokens), totalTokens: num(usageRaw.total_tokens), estimatedCostUsd: num(usageRaw.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageRaw.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model, promptCacheHitTokens: num(usageRaw.prompt_cache_hit_tokens), promptCacheMissTokens: num(usageRaw.prompt_cache_miss_tokens) };
      return { ...parsed, usage };
    } catch (error) {
      if (controller?.signal.aborted) {
        // 看门狗/总超时中断：区分"迟迟没开始输出"与"整体超时"，给玩家可理解的提示
        lastError = new ModelError(
          firstTokenSeen
            ? "模型响应超时（超过 60 秒），请稍后重试或更换模型"
            : "模型迟迟未开始输出（超过 25 秒），正在重试"
        );
      } else {
        lastError = toModelError(error);
      }
      if (!lastFailureReason) {
        lastFailureReason = lastError.message.includes("无法解析为 JSON")
          ? "JSON 无法解析（可能被截断或混入多余文字）"
          : lastError.message.startsWith("模型返回内容未满足")
            ? lastError.message
            : "";
      }
      logModelDiagnostic("event-attempt-fail", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", attempt, error: lastError.message, raw: generatedText });
    }
    if (attempt < MAX_MODEL_ATTEMPTS) yield { retry: true, reason: lastFailureReason };
  }
  // 兜底：模型连续失败也不让一局人生永远卡在同一个决策节点上。
  // 用确定性回退事件推进，保证玩家始终能继续；转录同样记录这份回退事件。
  logModelDiagnostic("event-fallback", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", reason: lastFailureReason || lastError.message });
  const fallback = buildFallbackEvent(state, choice, scenario.mode === "normal" ? parseAvoidStorylines(state.flags.avoidStorylines) : [], scenario);
  if (openingAtCurrentAge) fallback.timePassed = 0;
  else if (scenario.mode === "script" || scenario.mode === "foru") fallback.timePassed = Math.min(5, Math.max(1, fallback.timePassed));
  return { ...fallback, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, provider: baseUrl, model, fallbackReason: lastFailureReason || lastError.message } };
}

export async function generateNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>): Promise<NextEvent> {
  const iterator = streamNextEvent(state, choice, requestConfig);
  let item = await iterator.next();
  while (!item.done) item = await iterator.next();
  return item.value;
}



// 诊断人生回顾契约失败原因：返回 null 表示通过，否则返回具体原因。
export function diagnoseEnding(value: unknown): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.age !== "number") return "age 缺失或非数字";
  const facts = candidate.facts && typeof candidate.facts === "object" ? candidate.facts as Record<string, unknown> : null;
  if (!facts) return "缺少 facts 对象";
  if (typeof facts.occupation !== "string" || !facts.occupation.trim()) return "facts.occupation 缺失或为空";
  if (typeof facts.city !== "string" || !facts.city.trim()) return "facts.city 缺失或为空";
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.filter((item): item is { title: string } => Boolean(item) && typeof item === "object" && typeof (item as { title?: unknown }).title === "string" && Boolean((item as { title: string }).title.trim()))
    : [];
  if (highlights.length < 2) return "highlights 少于 2 个有效人生节点";
  const patterns = Array.isArray(candidate.patterns) ? candidate.patterns.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  if (patterns.length < 1) return "patterns 缺失或为空";
  if (typeof candidate.death !== "string" || !candidate.death.trim()) return "death 缺失或为空";
  const texts = [...highlights.map((item) => item.title), ...patterns];
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：关键字段缺失或含姓名指示词返回 null，调用方抛错。
export function normalizeEnding(value: unknown): LifeEnding | null {
  if (diagnoseEnding(value) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const facts = candidate.facts as Record<string, unknown>;
  const highlights = (Array.isArray(candidate.highlights) ? candidate.highlights : []).flatMap((item) => {
    const highlight = item as Record<string, unknown>;
    return [{ age: typeof highlight.age === "number" ? highlight.age : candidate.age as number, title: (highlight.title as string).trim() }];
  }).slice(0, 8);
  const patterns = (Array.isArray(candidate.patterns) ? candidate.patterns : []).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3);
  return {
    age: candidate.age as number,
    death: (candidate.death as string).trim(),
    facts: { occupation: (facts.occupation as string).trim(), city: (facts.city as string).trim(), events: typeof facts.events === "number" ? facts.events : 0 },
    highlights,
    patterns,
    question: "如果可以再活一次，你会做出不同的选择吗？",
  };
}

// 结局硬事实纠正：年龄、事件数、死因必须以状态为准（LLM 可能抄示例编造年龄，
// 如"27 岁人生被写成 81 岁"）；LLM 只负责回顾文字本身。
export function applyEndingHardFacts(ending: LifeEnding, state: LifeState): LifeEnding {
  const cause = typeof state.flags.deathCause === "string" ? DEATH_CAUSE_LABEL[state.flags.deathCause] : undefined;
  return {
    ...ending,
    age: state.basic.age,
    death: cause ?? ending.death,
    facts: { ...ending.facts, events: state.history.length },
    question: getScenarioReviewQuestion(getLifeScenario(state)),
  };
}

export async function generateEnding(state: LifeState, requestConfig?: Partial<ModelConfig>): Promise<LifeEnding> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  const scenario = getLifeScenario(state);
  const scenarioReview = buildScenarioReviewDirective(scenario);
  const prompt = JSON.stringify({
    life_state: state,
    scenario: state.scenario,
    recent_history: state.history.slice(-12),
    major_memories: state.majorMemories,
    behavioral_summary: state.psychology.behaviorPatterns,
    current_age: state.basic.age,
    death_cause: state.flags.deathCause ?? "natural",
  });
  const systemPrompt = scenarioReview ? `${ENDING_SYSTEM_PROMPT}\n\n${scenarioReview}` : ENDING_SYSTEM_PROMPT;
  const messages = [{ role: "system" as const, content: systemPrompt }, { role: "user" as const, content: prompt }];
  let lastError: ModelError = new ModelError("模型请求失败");
  let lastFailureReason = "";
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let rawContent = "";
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 2048, response_format: { type: "json_object" }, messages: withRetryCorrection(attempt, messages, lastFailureReason, "age 为数字，death 为字符串，facts 含 occupation/city/events，highlights 4-8 条（每项含 age 和 title），patterns 1-3 句，全程不含姓名。") }),
      });
      if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      rawContent = payload.choices?.[0]?.message?.content ?? "";
      const generated = parseGeneratedJson(rawContent || "{}");
      const reason = diagnoseEnding(generated);
      if (reason) {
        logModelDiagnostic("ending-contract-fail", { attempt, reason, raw: rawContent });
        throw new ModelError(`模型返回内容未满足人生回顾契约：${reason}`);
      }
      const ending = normalizeEnding(generated);
      if (!ending) throw new ModelError("模型返回内容未满足人生回顾契约");
      return applyEndingHardFacts(ending, state);
    } catch (error) {
      lastError = toModelError(error);
      if (!lastFailureReason) {
        lastFailureReason = lastError.message.includes("无法解析为 JSON")
          ? "JSON 无法解析（可能被截断或混入多余文字）"
          : lastError.message.startsWith("模型返回内容未满足")
            ? lastError.message
            : "";
      }
      logModelDiagnostic("ending-attempt-fail", { attempt, error: lastError.message, raw: rawContent });
    }
  }
  throw lastError;
}
