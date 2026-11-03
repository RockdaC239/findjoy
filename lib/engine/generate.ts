import type { LifeState, LifeChoice, NextEvent, ModelUsage, LifeEnding } from "../life";
import { DEATH_CAUSE_LABEL } from "../life";
import { getProvider, resolveProviderModel } from "../provider-catalog";
import { getModelConfigMode, resolveStoredModelConfig } from "../model-config";
import { flagsToBackground } from "../background";
import { leftStorylines, parseAvoidStorylines, type StorylineGuards } from "../storyline";
import { buildScenarioReviewDirective, buildThemeTurnHint, getLifeScenario, getScenarioReviewQuestion } from "../modes/scenario";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./prompts/assemble";
import { ModelError } from "./errors";
import { buildFallbackEvent } from "./fallback";
import { buildNextEventMessages, withRetryCorrection, type TranscriptMessage } from "./context";
import { detectValueAxis, lastChoiceNode, parseGeneratedJson, parseWithTruncationRepair, normalizeGeneratedEvent, diagnoseGeneratedEvent, repairGeneratedEvent, diagnoseEnding, normalizeEnding } from "./event-contract";

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

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

export type ModelStreamChunk = { text?: string; retry?: boolean; reason?: string };

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
