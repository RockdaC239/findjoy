import { CHILDHOOD_BOUNDARY, crossesAdulthoodBoundary } from "./phase";
import { streamModel, requestModel, resolveModelConfig, MAX_MODEL_ATTEMPTS, type ModelConfig } from "./model-client";
import { EVENT_RETRY_GUIDANCE, ENDING_RETRY_GUIDANCE } from "./event-contract";
import type { LifeState, LifeChoice, NextEvent, ModelUsage, LifeEnding } from "../life";
import { DEATH_CAUSE_LABEL } from "../life";
import { parseAvoidStorylines } from "../storyline";
import { getLifeScenario, getScenarioReviewQuestion } from "../modes/scenario";
import { ModelError } from "./errors";
import { buildFallbackEvent } from "./fallback";
import { prepareEventRequest, buildEndingMessages, withRetryCorrection, type TranscriptMessage } from "./context";
import { parseGeneratedJson, parseWithTruncationRepair, normalizeGeneratedEvent, diagnoseGeneratedEvent, repairGeneratedEvent, diagnoseEnding, normalizeEnding, alignProtagonistAge } from "./event-contract";

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

function logModelDiagnostic(context: string, fields: Record<string, unknown>) {
  if (process.env.NODE_ENV === "test") return;
  const safe = Object.fromEntries(Object.entries(fields).filter(([key, value]) => ["age", "phase", "attempt", "clampedTo"].includes(key) && (typeof value === "number" || ["decision", "childhood"].includes(String(value)))));
  console.warn(`[model-diagnostic] ${context} ${JSON.stringify(safe)}`);
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError") return new ModelError("模型响应超时（超过 60 秒），请稍后重试或更换模型");
  return new ModelError("模型请求失败，请稍后重试");
}

export type ModelStreamChunk = { text?: string; retry?: boolean; reason?: string };

export async function* streamNextEvent(state: LifeState, choice?: LifeChoice, requestConfig?: Partial<ModelConfig>, transcript?: TranscriptMessage[] | null): AsyncGenerator<ModelStreamChunk, NextEvent> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey, baseUrl, model } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  const { scenario, openingAtCurrentAge, expectChoices, previousChoices, storylineGuards, messages } = prepareEventRequest(state, choice, transcript);
  let lastError: ModelError = new ModelError("模型请求失败");
  let lastFailureReason = "";
  const usageTotals: Record<string, unknown> = {};
  const addUsage = (raw: Record<string, unknown>) => {
    for (const key of ["prompt_tokens", "completion_tokens", "total_tokens", "prompt_cache_hit_tokens", "prompt_cache_miss_tokens"]) usageTotals[key] = num(usageTotals[key]) + Math.max(0, num(raw[key]));
  };
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let generatedText = "";
    let usageRaw: Record<string, unknown> = {};
    try {
      for await (const chunk of streamModel(config, withRetryCorrection(attempt, messages, lastFailureReason, EVENT_RETRY_GUIDANCE))) {
        if (chunk.text !== undefined) {
          generatedText += chunk.text;
          yield { text: chunk.text };
        }
        if (chunk.usage) usageRaw = chunk.usage;
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
      if (parsed.outcome !== "death" && !expectChoices && crossesAdulthoodBoundary(state.basic.age, parsed.timePassed)) {
        // 安全兜底：童年提示词要求落地 <15 岁，若模型仍越界，硬钳制落地到 14 岁（不重生成）。
        // 正常路径下从 14 岁起已切到决策提示词，这里只防模型违规。
        parsed.timePassed = CHILDHOOD_BOUNDARY - 1 - state.basic.age;
        logModelDiagnostic("childhood-landing-clamped", { age: state.basic.age, clampedTo: CHILDHOOD_BOUNDARY - 1 });
      }
      // 剧本/ForU 第一幕必须落在当前年龄；后续节点把节奏收紧到 1~5 年。
      if (openingAtCurrentAge) parsed.timePassed = 0;
      else if (scenario.mode === "script" || scenario.mode === "foru") parsed.timePassed = Math.min(5, Math.max(1, parsed.timePassed));
      parsed.story = alignProtagonistAge(parsed.story, state.basic.age + parsed.timePassed);
      addUsage(usageRaw);
      const usage: ModelUsage = { promptTokens: num(usageTotals.prompt_tokens), completionTokens: num(usageTotals.completion_tokens), totalTokens: num(usageTotals.total_tokens), estimatedCostUsd: num(usageTotals.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageTotals.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model, promptCacheHitTokens: num(usageTotals.prompt_cache_hit_tokens), promptCacheMissTokens: num(usageTotals.prompt_cache_miss_tokens) };
      return { ...parsed, usage };
    } catch (error) {
      addUsage(usageRaw);
      lastError = toModelError(error);
      if (!lastError.retryable) throw lastError;
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
  fallback.story = alignProtagonistAge(fallback.story, state.basic.age + fallback.timePassed);
  return { ...fallback, usage: { promptTokens: num(usageTotals.prompt_tokens), completionTokens: num(usageTotals.completion_tokens), totalTokens: num(usageTotals.total_tokens), estimatedCostUsd: num(usageTotals.prompt_tokens) / 1_000_000 * config.inputCostPerMillion + num(usageTotals.completion_tokens) / 1_000_000 * config.outputCostPerMillion, provider: baseUrl, model, fallbackReason: lastFailureReason || lastError.message } };
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
  const historyIds = new Set(state.history.map(event => event.id));
  const evidenceEventIds = [...new Set(ending.evidenceEventIds ?? [])].filter(id => historyIds.has(id)).slice(0, 4);
  const supported = Boolean(ending.reflection && evidenceEventIds.length);
  return {
    ...ending,
    ...(ending.reflection || ending.evidenceEventIds || ending.shareLines ? {
      evidenceEventIds,
      reflection: supported ? ending.reflection : undefined,
      shareLines: supported ? ending.shareLines : undefined,
    } : {}),
    age: state.basic.age,
    death: cause ?? ending.death,
    facts: { ...ending.facts, events: state.history.length },
    question: getScenarioReviewQuestion(getLifeScenario(state)),
  };
}

export async function generateEnding(state: LifeState, requestConfig?: Partial<ModelConfig>, onUsage?: (usage: Record<string, unknown>) => void): Promise<LifeEnding> {
  const config = resolveModelConfig(requestConfig);
  const { apiKey } = config;
  if (!apiKey) throw new ModelError("未配置 API Key，请在模型设置中填写后重试");
  const messages = buildEndingMessages(state);
  let lastError: ModelError = new ModelError("模型请求失败");
  let lastFailureReason = "";
  for (let attempt = 1; attempt <= MAX_MODEL_ATTEMPTS; attempt++) {
    let rawContent = "";
    try {
      rawContent = await requestModel(config, withRetryCorrection(attempt, messages, lastFailureReason, ENDING_RETRY_GUIDANCE), onUsage);
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
      if (!lastError.retryable) throw lastError;
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
