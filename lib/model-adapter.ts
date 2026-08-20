import type { LifeState, LifeChoice, NextEvent, ModelUsage, LifeEnding } from "./life";
import { getProvider, resolveProviderModel } from "./provider-catalog";

const SYSTEM_PROMPT = `你不是奖励玩家成功的游戏系统。模拟真实、复杂、不确定的人生，不定义幸福。全程只用第二人称“你”称呼玩家。禁止出现任何人物姓名、昵称、英文名、姓名占位符；其他人物只能使用关系或角色称谓，例如父亲、母亲、同学、伴侣、老师、邻居。

只返回一个 JSON 对象，不要 Markdown，不要解释。必须严格使用下面的 camelCase 字段：
{"timePassed":1,"story":"...","event":{"type":"family","title":"...","importance":0.7},"choices":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}],"objectiveChanges":{},"memory":"..."}
event.type 只能是 career、relationship、health、finance、random、family。choices 必须是 2 至 3 个真正不同且合理的选择。`;
const occupations = ["产品经理", "软件工程师", "教师", "设计师", "研究员"];
export const MODEL_REQUEST_TIMEOUT_MS = 60_000;

export class ModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelError";
  }
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

// 只匹配明确的命名句式（名叫/名字叫/叫作…），避免把“叫外卖”这类动词误判为姓名。
function containsNameInstruction(value: string) {
  return /(?:姓名|名字|名为|叫作|叫做|名叫)[：:\s]*[\u4e00-\u9fffA-Za-z]{1,12}/u.test(value);
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

// 严格契约：任何关键字段缺失、类型非法或含姓名指示词都返回 null，调用方抛错。
export function normalizeGeneratedEvent(value: unknown): NextEvent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  const story = typeof candidate.story === "string" && candidate.story.trim() ? candidate.story.trim() : null;
  const title = event && typeof event.title === "string" && event.title.trim() ? event.title.trim() : null;
  const type = event && EVENT_TYPES.includes(event.type as (typeof EVENT_TYPES)[number]) ? event.type as NextEvent["event"]["type"] : null;
  const choices = normalizeChoices(candidate.choices);
  if (!story || !title || !type || choices.length < 2) return null;
  const textFields = [story, candidate.memory, title, ...choices.map((item) => item.text)];
  if (textFields.filter((text): text is string => typeof text === "string").some(containsNameInstruction)) return null;
  return {
    timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || 1)),
    story,
    event: { type, title, importance: Math.max(0, Math.min(1, num(event?.importance) || 0.6)) },
    choices,
    objectiveChanges: normalizeObjectiveChanges(candidate.objectiveChanges ?? candidate.objective_changes),
    memory: typeof candidate.memory === "string" && candidate.memory.trim() ? candidate.memory.trim() : undefined,
  };
}

export type ModelStreamChunk = { text: string };

export function buildModelPrompt(state: LifeState, choice?: LifeChoice) {
  const recentHistory = state.history.slice(-8);
  const eventContext = {
    current_choice: choice ?? null,
    previous_event: recentHistory.at(-1) ?? null,
  };
  return JSON.stringify({
    life_state: state,
    recent_history: recentHistory,
    previous_events: recentHistory,
    major_memories: state.majorMemories,
    important_memories: state.majorMemories,
    hidden_value_profile: state.psychology.valueProfile,
    behavioral_summary: state.psychology.behaviorPatterns,
    current_age: state.basic.age,
    event_context: eventContext,
    current_choice: choice ?? null,
    random_seed_event: null,
  });
}

export async function* streamNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>): AsyncGenerator<ModelStreamChunk, NextEvent> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  const prompt = buildModelPrompt(state, choice);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS), body: JSON.stringify({ model, temperature: 0.8, stream: true, stream_options: { include_usage: true }, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
    if (!response.body) throw new ModelError("模型服务未返回内容");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let generatedText = "";
    let usageRaw: Record<string, unknown> = {};
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
      throw new ModelError("模型返回内容无法解析为 JSON，请重试或更换模型");
    }
    const parsed = normalizeGeneratedEvent(generated);
    if (!parsed) throw new ModelError("模型返回内容未满足事件契约（需要 story / event / 至少 2 个选择，且不含姓名），请重试");
    const usage: ModelUsage = { promptTokens: num(usageRaw.prompt_tokens), completionTokens: num(usageRaw.completion_tokens), totalTokens: num(usageRaw.total_tokens), estimatedCostUsd: num(usageRaw.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageRaw.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model };
    return { ...parsed, usage };
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") throw new ModelError("模型响应超时（超过 60 秒），请稍后重试或更换模型");
    throw new ModelError(error instanceof Error ? `模型请求失败：${error.message}` : "模型请求失败");
  }
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
只返回一个 JSON 对象，不要 Markdown，不要解释。必须严格使用下面的 camelCase 字段：
{"age":81,"death":"自然离世","facts":{"occupation":"程序员","city":"深圳","events":34},"highlights":[{"age":27,"title":"你放弃了第一次创业机会"},{"age":45,"title":"你选择回到家人身边"}],"patterns":["从你的选择来看，你常常会在真正重要的时刻为关系停下来。","年轻时你也许很在意别人的认可，后来你越来越愿意按照自己的判断生活。"]}
highlights 必须是 4 至 8 个真正改变人生方向的节点；patterns 必须是 1 至 3 句观察，不带价值判断。`;

// 严格契约：关键字段缺失或含姓名指示词返回 null，调用方抛错。
export function normalizeEnding(value: unknown, state: LifeState): LifeEnding | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const facts = candidate.facts && typeof candidate.facts === "object" ? candidate.facts as Record<string, unknown> : {};
  const age = typeof candidate.age === "number" ? candidate.age : null;
  const occupation = typeof facts.occupation === "string" && facts.occupation.trim() ? facts.occupation.trim() : null;
  const city = typeof facts.city === "string" && facts.city.trim() ? facts.city.trim() : null;
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const highlight = item as Record<string, unknown>;
        if (typeof highlight.title !== "string" || !highlight.title.trim()) return [];
        return [{ age: typeof highlight.age === "number" ? highlight.age : age ?? state.basic.age, title: highlight.title.trim() }];
      }).slice(0, 8)
    : [];
  const patterns = Array.isArray(candidate.patterns) ? candidate.patterns.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3) : [];
  const death = typeof candidate.death === "string" && candidate.death.trim() ? candidate.death.trim() : null;
  if (age === null || !occupation || !city || highlights.length < 2 || patterns.length < 1 || !death) return null;
  const texts = [...highlights.map((item) => item.title), ...patterns];
  if (texts.some(containsNameInstruction)) return null;
  return {
    age,
    death,
    facts: { occupation, city, events: typeof facts.events === "number" ? facts.events : 0 },
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
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
      body: JSON.stringify({ model, temperature: 0.7, response_format: { type: "json_object" }, messages: [{ role: "system", content: ENDING_SYSTEM_PROMPT }, { role: "user", content: prompt }] }),
    });
    if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    let generated: unknown;
    try {
      generated = JSON.parse(content || "{}");
    } catch {
      throw new ModelError("模型返回内容无法解析为 JSON，请重试或更换模型");
    }
    const ending = normalizeEnding(generated, state);
    if (!ending) throw new ModelError("模型返回内容未满足人生回顾契约（需要 age / facts / 至少 2 个人生节点 / 至少 1 句观察，且不含姓名），请重试");
    return ending;
  } catch (error) {
    if (error instanceof ModelError) throw error;
    if (error instanceof DOMException && error.name === "TimeoutError") throw new ModelError("模型响应超时（超过 60 秒），请稍后重试或更换模型");
    throw new ModelError(error instanceof Error ? `模型请求失败：${error.message}` : "模型请求失败");
  }
}
