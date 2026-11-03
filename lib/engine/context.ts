import { flagsToBackground } from "../background";
import { leftStorylines, parseAvoidStorylines, type StorylineGuards } from "../storyline";
import { buildScenarioReviewDirective, buildThemeTurnHint, getLifeScenario } from "../modes/scenario";
import { detectValueAxis, lastChoiceNode } from "./event-contract";
import { buildSystemPrompt, ENDING_SYSTEM_PROMPT } from "./prompts/assemble";
import { CHILDHOOD_BOUNDARY } from "./phase";
import type { LifeState, LifeChoice } from "../life";

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

// 重试时给模型带回失败原因，避免"同样的错再犯一遍"（盲重试）。
// guidance 按场景给出该契约的字段要点。
export function withRetryCorrection(attempt: number, messages: NextEventMessage[], failureReason: string, guidance: string): NextEventMessage[] {
  if (attempt === 1 || !failureReason) return messages;
  return [
    ...messages,
    { role: "user", content: `你上一轮输出的 JSON 未通过校验：${failureReason}。请直接重新输出一个完全合规的 JSON 对象：不要 Markdown 代码块、不要任何解释或多余文字。${guidance}` },
  ];
}


// 生产生成和本地预览共用入口；模式差异来自 modes/，不进入模型通信层。
export function prepareEventRequest(state: LifeState, choice?: LifeChoice, transcript?: TranscriptMessage[] | null) {
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
  return { scenario, openingAtCurrentAge, expectChoices, previousChoices, storylineGuards, messages };
}

export function buildEndingMessages(state: LifeState): NextEventMessage[] {
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
  return messages;
}
