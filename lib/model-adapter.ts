import type { LifeState, LifeChoice, NextEvent, ModelUsage, LifeEnding } from "./life";
import { buildEnding } from "./life";
import { getProvider, resolveProviderModel } from "./provider-catalog";

const SYSTEM_PROMPT = `你不是奖励玩家成功的游戏系统。模拟真实、复杂、不确定的人生，不定义幸福。全程只用第二人称“你”称呼玩家。禁止出现任何人物姓名、昵称、英文名、姓名占位符；其他人物只能使用关系或角色称谓，例如父亲、母亲、同学、伴侣、老师、邻居。

只返回一个 JSON 对象，不要 Markdown，不要解释。必须严格使用下面的 camelCase 字段：
{"timePassed":1,"story":"...","event":{"type":"family","title":"...","importance":0.7},"choices":[{"id":"A","text":"..."},{"id":"B","text":"..."},{"id":"C","text":"..."}],"objectiveChanges":{},"memory":"..."}
event.type 只能是 career、relationship、health、finance、random、family。choices 必须是 2 至 3 个真正不同且合理的选择。`;
const occupations = ["产品经理", "软件工程师", "教师", "设计师", "研究员"];
export const MODEL_REQUEST_TIMEOUT_MS = 25_000;

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

const fallback = buildFallbackEvent;

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

function containsNameInstruction(value: string) {
  return /(?:姓名|名字|名为|叫作|叫做|叫)[：:\s]*[\u4e00-\u9fffA-Za-z]{1,12}/u.test(value);
}

export function normalizeGeneratedEvent(value: unknown, state: LifeState, choice?: LifeChoice): NextEvent {
  const base = fallback(state, choice);
  if (!value || typeof value !== "object") return base;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event as Record<string, unknown> | undefined;
  const choices = Array.isArray(candidate.choices) ? candidate.choices.filter((item): item is LifeChoice => Boolean(item) && typeof item === "object" && typeof (item as LifeChoice).id === "string" && typeof (item as LifeChoice).text === "string").slice(0, 3) : [];
  const types = ["career", "relationship", "health", "finance", "random", "family"] as const;
  const type = event && types.includes(event.type as (typeof types)[number]) ? event.type as NextEvent["event"]["type"] : base.event.type;
  const changes = candidate.objectiveChanges && typeof candidate.objectiveChanges === "object" ? candidate.objectiveChanges as NextEvent["objectiveChanges"] : candidate.objective_changes && typeof candidate.objective_changes === "object" ? candidate.objective_changes as NextEvent["objectiveChanges"] : base.objectiveChanges;
  const textFields = [candidate.story, candidate.memory, event?.title, ...choices.map((item) => item.text)].filter((item): item is string => typeof item === "string");
  if (textFields.some(containsNameInstruction)) return base;
  return { ...base, timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || base.timePassed)), story: typeof candidate.story === "string" ? candidate.story : base.story, event: { type, title: typeof event?.title === "string" ? event.title : base.event.title, importance: Math.max(0, Math.min(1, num(event?.importance) || base.event.importance)) }, choices: choices.length >= 2 ? choices : base.choices, objectiveChanges: changes, memory: typeof candidate.memory === "string" ? candidate.memory : base.memory };
}

function isGeneratedEventUsable(value: unknown) {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.story === "string" && typeof candidate.event === "object" && Array.isArray(candidate.choices) && candidate.choices.length >= 2;
}

export type ModelStreamChunk = { text: string };

function fallbackWithReason(state: LifeState, choice: LifeChoice | undefined, reason: string): NextEvent {
  return { ...fallback(state, choice), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, provider: "deterministic-after-error", model: "fallback", fallbackReason: reason } };
}

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
  if (!apiKey) {
    const event = { ...fallback(state, choice), usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostUsd: 0, provider: "deterministic", model: "fallback", fallbackReason: "未配置 API Key" } };
    yield { text: event.story };
    return event;
  }
  const prompt = buildModelPrompt(state, choice);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS), body: JSON.stringify({ model, temperature: 0.8, stream: true, stream_options: { include_usage: true }, response_format: { type: "json_object" }, messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: prompt }] }) });
    if (!response.ok) throw new Error(`LLM request failed: ${response.status}`);
    if (!response.body) throw new Error("LLM response body is empty");
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
    const generated = JSON.parse(generatedText || "{}");
    const parsed = normalizeGeneratedEvent(generated, state, choice);
    const usage: ModelUsage = { promptTokens: num(usageRaw.prompt_tokens), completionTokens: num(usageRaw.completion_tokens), totalTokens: num(usageRaw.total_tokens), estimatedCostUsd: num(usageRaw.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageRaw.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model };
    return { ...parsed, usage: isGeneratedEventUsable(generated) ? usage : { ...usage, fallbackReason: "模型返回内容未满足事件 JSON 契约" } };
  } catch (error) {
    const event = fallbackWithReason(state, choice, error instanceof Error ? error.message : "模型请求失败");
    yield { text: event.story };
    return event;
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

export function normalizeEnding(value: unknown, state: LifeState, fallback: LifeEnding): LifeEnding {
  if (!value || typeof value !== "object") return fallback;
  const candidate = value as Record<string, unknown>;
  const facts = candidate.facts && typeof candidate.facts === "object" ? candidate.facts as Record<string, unknown> : {};
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const highlight = item as Record<string, unknown>;
        if (typeof highlight.title !== "string") return [];
        return [{ age: typeof highlight.age === "number" ? highlight.age : state.basic.age, title: highlight.title }];
      }).slice(0, 8)
    : [];
  const patterns = Array.isArray(candidate.patterns) ? candidate.patterns.filter((item): item is string => typeof item === "string").slice(0, 3) : [];
  const texts = [...highlights.map((item) => item.title), ...patterns];
  if (texts.some(containsNameInstruction)) return fallback;
  return {
    age: typeof candidate.age === "number" ? candidate.age : fallback.age,
    death: typeof candidate.death === "string" && candidate.death.trim() ? candidate.death : fallback.death,
    facts: {
      occupation: typeof facts.occupation === "string" && facts.occupation.trim() ? facts.occupation : fallback.facts.occupation,
      city: typeof facts.city === "string" && facts.city.trim() ? facts.city : fallback.facts.city,
      events: typeof facts.events === "number" ? facts.events : fallback.facts.events,
    },
    highlights: highlights.length >= 2 ? highlights : fallback.highlights,
    patterns: patterns.length ? patterns : fallback.patterns,
    question: fallback.question,
  };
}

export async function generateEnding(state: LifeState, requestConfig?: Partial<ModelConfig>): Promise<LifeEnding> {
  const fallback = buildEnding(state);
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) return fallback;
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
    if (!response.ok) throw new Error(`LLM ending request failed: ${response.status}`);
    const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = payload.choices?.[0]?.message?.content ?? "";
    return normalizeEnding(JSON.parse(content || "{}"), state, fallback);
  } catch {
    return fallback;
  }
}
