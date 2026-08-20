import type { LifeState, LifeChoice, NextEvent, ModelUsage, LifeEnding } from "./life";
import { getProvider, resolveProviderModel } from "./provider-catalog";

const SYSTEM_PROMPT = `你不是奖励玩家成功的游戏系统。模拟真实、复杂、不确定的人生，不定义幸福。全程只用第二人称“你”称呼玩家。禁止出现任何人物姓名、昵称、英文名、姓名占位符；其他人物只能使用关系或角色称谓，例如父亲、母亲、同学、伴侣、老师、邻居。

人生推演节奏：这不是娓娓道来的小说，而是一次浓缩的人生。时间可以大幅跳跃（每次 1~8 年，童年也可以一次跳过数年）。每一个事件都必须是人生节点级别的重要事件——转折、变故、机会、失去、关系变化、关键决定；不要写日常琐事或流水账。每一段现状都要说得准、说得透。

开局第一个事件更要重要：必须从至少 4 岁写起（timePassed 硬约束 4~7，绝对不要在 0/1/2/3 岁写开局），直接反映那个年龄阶段最重要的节点，让玩家一开局就面临第一个有分量的抉择。重要不等于惨：一个安稳家庭里孩子第一次为自己争取什么、一次天赋被发现，同样有分量；不要默认写家庭变故或亲人患病。开局基调由本局固定的"开局基调"指令指定，四种基调轮换出现，本次是哪种就写哪种。

只返回一个 JSON 对象，不要 Markdown 代码块，不要任何额外文字或解释。必须严格使用下面的 camelCase 字段，并按此顺序输出（story 在前、event 在后）：
{"timePassed":3,"story":"...","event":{"type":"family","title":"...","importance":0.8},"choices":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}],"objectiveChanges":{},"memory":"..."}
字段含义：
- story：上一次选择之后，人生现状的精准速写（60 至 150 字）。只说明“现在变成了什么样”，不叙述过程、不做铺垫。展示顺序在最前。
- event：在当前现状下发生的一件事，必须是重要的人生节点；title 用一句话点题，展示在 story 之后。
- event.type 只能是英文枚举值之一：career、relationship、health、finance、random、family（不要使用中文或其它单词）。
- choices：这个事件带来的 2 至 3 个真正不同且合理的关键抉择，每项必须包含 id 和 text。
  **硬约束：三个选项之间必须有清晰的价值张力，每个选项必须代表一种不同的人生价值或方向**（例如放弃/坚持、个人/家庭、安稳/冒险、服从/反叛、理性/感性、短利/长利、逃避/面对、向内/向外等），不能是同一种态度的不同措辞（例如不能三个都是"接受/适应/顺其自然"）。选 A、选 B、选 C，必须让你的人生走向不同分支；如果三个选项读起来意思接近，说明你写错了。
  写法建议：选项文本里直接点出你要表达的价值立场（如"为了撑住这个家，..."、"我不想被这件事拖住，..."、"找专业的人来帮忙，比我自己扛更靠谱..."），让玩家一眼看出区别。
- objectiveChanges：本次事件造成的客观变化，可为空对象。
- memory：一句话浓缩这次事件。`;

export const CHILDHOOD_SYSTEM_PROMPT = `你不是奖励玩家成功的游戏系统。模拟真实、复杂、不确定的人生，不定义幸福。全程只用第二人称“你”称呼玩家。禁止出现任何人物姓名、昵称、英文名、姓名占位符；其他人物只能使用关系或角色称谓，例如父亲、母亲、同学、伴侣、老师、邻居。

你正处在童年阶段（15 岁以下）。这个阶段的孩子无法决定人生走向：家庭变故、迁徙、升学、经济状况都由命运和大人的决定塑造。因此绝对不要生成任何 choices（选择），只推进命运本身。人生会自然过渡到成年后的自主选择阶段。

只返回一个 JSON 对象，不要 Markdown 代码块，不要任何额外文字或解释。必须严格使用下面的 camelCase 字段（注意：没有 choices 字段），并按此顺序输出（story 在前、event 在后）：
{"timePassed":5,"story":"...","event":{"type":"family","title":"...","importance":0.8},"objectiveChanges":{},"memory":"..."}
字段含义：
- story：这段童年里，你的人生现状精准速写（60 至 150 字）。只描述“命运把你带到了哪里、你长成了什么样”，不写任何选择。
- event：这段童年里发生的最重要的一件事（家庭变故、迁徙、入学、亲人生病、交到朋友、学会一件本领等），必须是重要节点；title 用一句话点题，展示在 story 之后。童年同样遵循本局"开局基调"：不是每一局的童年都要写变故或苦难，普通温暖的成长也有分量。
- event.type 只能是英文枚举值之一：career、relationship、health、finance、random、family（不要使用中文或其它单词）。
- timePassed：时间跳跃（建议 4~7 年，童年可以大幅跳跃）。
- objectiveChanges：这段童年造成的客观变化，可为空对象。
- memory：一句话浓缩这段童年。`;
const occupations = ["产品经理", "软件工程师", "教师", "设计师", "研究员"];
export const CHILDHOOD_BOUNDARY = 15;
export const MODEL_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_MODEL_ATTEMPTS = 3;

// 开局基调：每局开始时（start 路由）随机选定一种并写入 state.flags.openingGenre，
// 作为本局系统提示词的固定后缀。同一局内前缀字节稳定，不破坏 DeepSeek 上下文缓存；
// 四选一保证"家庭变故"类开局只占约四分之一，不再默认 100% 变故型。
export const OPENING_GENRES = ["安稳日常", "机会降临", "家庭变故", "平静起点"] as const;
export type OpeningGenre = (typeof OPENING_GENRES)[number];

export const OPENING_GENRE_GUIDANCE: Record<OpeningGenre, string> = {
  安稳日常: "写一个普通甚至温馨的家庭，日子平稳，一件小事让平静的生活泛起第一次波澜（发现天赋、交到朋友、父母的一个普通决定）；不写家庭困境，不写亲人患病。",
  机会降临: "写一个机会如何落到你面前：天赋被发现、贵人相助、一次意外的邀请或好运；开局基调可以明亮一些。",
  家庭变故: "写家庭的一次真实变故：搬迁、失业、亲人患病或离去。这只是四种基调之一，本局轮到了它，照实写即可。",
  平静起点: "写平淡而温暖的日常，第一个决定来自你自己的愿望或好奇，而不是外部危机。",
};

// 旧存档/无基调路径返回基础提示词；新局把基调指令追加为固定后缀。
export function buildSystemPrompt(expectChoices: boolean, openingGenre?: OpeningGenre): string {
  const base = expectChoices ? SYSTEM_PROMPT : CHILDHOOD_SYSTEM_PROMPT;
  if (!openingGenre) return base;
  return `${base}\n\n【本局开局基调】${openingGenre}：${OPENING_GENRE_GUIDANCE[openingGenre]}`;
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
  const providerModel = config?.providerId ? resolveProviderModel(config.providerId, config.model) : undefined;
  const requestedModel = typeof config?.model === "string" && config.model.trim() ? config.model.trim() : undefined;
  return {
    apiKey: (config?.apiKey || env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim(),
    providerId: providerModel?.providerId ?? "environment",
    baseUrl: providerModel?.baseUrl ?? (env.LLM_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, ""),
    model: requestedModel ?? providerModel?.model ?? (env.LLM_MODEL || env.OPENAI_MODEL || "gpt-4o-mini").trim(),
    inputCostPerMillion: providerModel && requestedModel === providerModel.model ? providerModel.inputCostPerMillion : (providerModel ? 0 : finiteOrZero(env.LLM_INPUT_COST_PER_MILLION)),
    outputCostPerMillion: providerModel && requestedModel === providerModel.model ? providerModel.outputCostPerMillion : (providerModel ? 0 : finiteOrZero(env.LLM_OUTPUT_COST_PER_MILLION)),
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

export function buildFallbackEvent(state: LifeState, choice?: LifeChoice): NextEvent {
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
  const objectiveChanges = age < 18 ? {} : phase.type === "career" ? { occupation: occupations[(age / 2) % occupations.length | 0], incomeYearly: 120000, cash: 20000 } : phase.type === "health" ? { physical: -8, cash: -5000 } : { partnerStatus: "稳定交往" };
  return { timePassed: phase.timePassed, story: choice ? `你选择了“${choice.text}”。生活没有给出即时答案，但一些方向开始改变。` : phase.story, event: { type: phase.type, title: phase.title, importance: 0.65 }, choices: [{ id: "A", text: "顺着眼前的变化慢慢适应" }, { id: "B", text: "在熟悉的节奏里再停留一会儿" }, { id: "C", text: "试着用自己的方式回应" }], objectiveChanges, psychologicalObservation: { uncertainty: "你似乎愿意为重要的人承担一些不确定性。" }, memory: `在${age}岁，你面对了${phase.title}。` };
}

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

// 只匹配明确的命名句式（名叫/名字叫/名字是/名为/叫作/叫做/姓名），
// 避免把“说出自己的名字”“报名字”这类自我介绍叙述误判为给人物起名，也避免“叫外卖”动词误杀。
function containsNameInstruction(value: string) {
  return /(?:名叫|名字叫|名字是|名为|叫作|叫做|姓名)[：:\s]*[\u4e00-\u9fffA-Za-z]{1,12}/u.test(value);
}

const EVENT_TYPES = ["career", "relationship", "health", "finance", "random", "family"] as const;

function normalizeChoices(value: unknown): LifeChoice[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is LifeChoice => Boolean(item) && typeof item === "object" && typeof (item as LifeChoice).id === "string" && typeof (item as LifeChoice).text === "string" && Boolean((item as LifeChoice).text.trim()))
    .slice(0, 3);
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

// 诊断哪一道契约关卡失败：返回 null 表示通过，否则返回具体原因。
// expectChoices=false 表示童年阶段，不要求 choices 字段。
export function diagnoseGeneratedEvent(value: unknown, expectChoices = true): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  if (!event) return "缺少 event 对象";
  if (typeof candidate.story !== "string" || !candidate.story.trim()) return "story 缺失或为空";
  if (typeof event.title !== "string" || !event.title.trim()) return "event.title 缺失或为空";
  if (!EVENT_TYPES.includes(event.type as (typeof EVENT_TYPES)[number])) return `event.type 非法：${String(event.type)}（应为 career/relationship/health/finance/random/family 之一）`;
  if (expectChoices && normalizeChoices(candidate.choices).length < 2) return "choices 少于 2 个有效选项（每项需 id + 非空 text）";
  const texts = [candidate.story, candidate.memory, event.title, ...normalizeChoices(candidate.choices).map((item) => item.text)]
    .filter((item): item is string => typeof item === "string");
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：任何关键字段缺失、类型非法或含姓名指示词都返回 null，调用方抛错。
export function normalizeGeneratedEvent(value: unknown, expectChoices = true): NextEvent | null {
  if (diagnoseGeneratedEvent(value, expectChoices) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event as Record<string, unknown>;
  const story = (candidate.story as string).trim();
  const title = (event.title as string).trim();
  const type = event.type as NextEvent["event"]["type"];
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

export type ModelStreamChunk = { text?: string; retry?: boolean };

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
  const expectChoices = state.basic.age >= CHILDHOOD_BOUNDARY;
  const openingGenre = state.flags.openingGenre as OpeningGenre | undefined;
  const systemPrompt = buildSystemPrompt(expectChoices, openingGenre);
  const messages = buildNextEventMessages(systemPrompt, state, choice, transcript);
  let lastError: ModelError = new ModelError("模型请求失败");
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let generatedText = "";
    let usageRaw: Record<string, unknown> = {};
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS), body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 4096, stream: true, stream_options: { include_usage: true }, response_format: { type: "json_object" }, messages }) });
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
              generatedText += content;
              yield { text: content };
            }
            if (packet.usage && typeof packet.usage === "object") usageRaw = packet.usage;
          } catch { /* Ignore malformed keepalive frames. */ }
        }
      }
      let generated: unknown;
      try {
        generated = JSON.parse(generatedText || "{}");
      } catch {
        throw new ModelError("模型返回内容无法解析为 JSON");
      }
      const reason = diagnoseGeneratedEvent(generated, expectChoices);
      if (reason) {
        logModelDiagnostic("event-contract-fail", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", attempt, reason, raw: generatedText });
        throw new ModelError(`模型返回内容未满足${expectChoices ? "事件" : "童年"}契约：${reason}`);
      }
      const parsed = normalizeGeneratedEvent(generated, expectChoices);
      if (!parsed) throw new ModelError("模型返回内容未满足事件契约");
      const usage: ModelUsage = { promptTokens: num(usageRaw.prompt_tokens), completionTokens: num(usageRaw.completion_tokens), totalTokens: num(usageRaw.total_tokens), estimatedCostUsd: num(usageRaw.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageRaw.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model, promptCacheHitTokens: num(usageRaw.prompt_cache_hit_tokens), promptCacheMissTokens: num(usageRaw.prompt_cache_miss_tokens) };
      return { ...parsed, usage };
    } catch (error) {
      lastError = toModelError(error);
      logModelDiagnostic("event-attempt-fail", { age: state.basic.age, phase: expectChoices ? "decision" : "childhood", attempt, error: lastError.message, raw: generatedText });
    }
    if (attempt < MAX_MODEL_ATTEMPTS) yield { retry: true };
  }
  throw lastError;
}

export async function generateNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>): Promise<NextEvent> {
  const iterator = streamNextEvent(state, choice, requestConfig);
  let item = await iterator.next();
  while (!item.done) item = await iterator.next();
  return item.value;
}

const ENDING_SYSTEM_PROMPT = `你是一位温和的观察者，正在为一生的选择做一场安静的回顾。
全程只用第二人称“你”称呼当事人；不出现任何姓名、昵称、英文名或姓名占位符；其他人只能用身份词，如父亲、母亲、伴侣、孩子、朋友。
不评价人生好坏，不给出分数、等级或“你就是……”这样的断言；使用“似乎、也许、可能、从你的选择来看”这样的语气。
只返回一个 JSON 对象，不要 Markdown 代码块，不要任何额外文字或解释。必须严格使用下面的 camelCase 字段：
{"age":81,"death":"自然离世","facts":{"occupation":"程序员","city":"深圳","events":34},"highlights":[{"age":27,"title":"你放弃了第一次创业机会"},{"age":45,"title":"你选择回到家人身边"}],"patterns":["从你的选择来看，你常常会在真正重要的时刻为关系停下来。","年轻时你也许很在意别人的认可，后来你越来越愿意按照自己的判断生活。"]}
highlights 必须是 4 至 8 个真正改变人生方向的节点；patterns 必须是 1 至 3 句观察，不带价值判断。`;

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

export async function generateEnding(state: LifeState, requestConfig?: Partial<ModelConfig>): Promise<LifeEnding> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  const prompt = JSON.stringify({
    life_state: state,
    recent_history: state.history.slice(-12),
    major_memories: state.majorMemories,
    behavioral_summary: state.psychology.behaviorPatterns,
    current_age: state.basic.age,
    death_cause: state.flags.deathCause ?? "natural",
  });
  let lastError: ModelError = new ModelError("模型请求失败");
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let rawContent = "";
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 2048, response_format: { type: "json_object" }, messages: [{ role: "system", content: ENDING_SYSTEM_PROMPT }, { role: "user", content: prompt }] }),
      });
      if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
      const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
      rawContent = payload.choices?.[0]?.message?.content ?? "";
      let generated: unknown;
      try {
        generated = JSON.parse(rawContent || "{}");
      } catch {
        throw new ModelError("模型返回内容无法解析为 JSON");
      }
      const reason = diagnoseEnding(generated);
      if (reason) {
        logModelDiagnostic("ending-contract-fail", { attempt, reason, raw: rawContent });
        throw new ModelError(`模型返回内容未满足人生回顾契约：${reason}`);
      }
      const ending = normalizeEnding(generated);
      if (!ending) throw new ModelError("模型返回内容未满足人生回顾契约");
      return ending;
    } catch (error) {
      lastError = toModelError(error);
      logModelDiagnostic("ending-attempt-fail", { attempt, error: lastError.message, raw: rawContent });
    }
  }
  throw lastError;
}
