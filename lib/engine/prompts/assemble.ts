import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBackgroundDirective, type LifeBackground } from "../../background";
import { buildStorylinePromptHint, type StorylineGuards } from "../../storyline";
import { buildOpeningDirective, buildScenarioDirective } from "../../modes/scenario";
import type { LifeScenario } from "../../modes/types";

// Markdown 是唯一文本源；只去掉文件末尾换行，保持现有请求字节不变。
function readPrompt(name: string): string {
  return readFileSync(path.join(process.cwd(), "lib/engine/prompts", `${name}.md`), "utf8").replace(/\n$/, "");
}

const SYSTEM_PROMPT = readPrompt("adult");
export const CHILDHOOD_SYSTEM_PROMPT = readPrompt("childhood");
export const ENDING_SYSTEM_PROMPT = readPrompt("ending");

// 出身档案：见 lib/background.ts。每局开局由 start 路由掷出三维出身并写入 flags，
// 这里把本局出身档案作为系统提示词的固定后缀；同一局内前缀字节稳定，不破坏 DeepSeek 上下文缓存。
// 旧存档（无出身档案）返回基础提示词。
// transitioning=true 表示"成年后的第一个决策节点"（14 岁迈入 15+），追加专属指令：
// 时间已过去、写落地年龄的你、严禁复述上一条童年事件——修"14 岁节点内容在 18 岁重生成"。
export interface SystemPromptOptions {
  background?: LifeBackground;
  transitioning?: boolean;
  avoidAxis?: string | null;
  storylineGuards?: StorylineGuards;
  /** 玩法情境。普通人生为 undefined 或 normal。 */
  scenario?: LifeScenario;
  /** 首轮开场；剧本/ForU 会强制 timePassed=0。 */
  isOpening?: boolean;
  /** 主题模式逐轮动态提醒，放在固定情境之后。 */
  themeHint?: string;
}

export function buildSystemPrompt(expectChoices: boolean, options: SystemPromptOptions = {}): string {
  const {
    background,
    transitioning = false,
    avoidAxis,
    storylineGuards,
    scenario,
    isOpening = false,
    themeHint,
  } = options;
  const base = expectChoices ? SYSTEM_PROMPT : CHILDHOOD_SYSTEM_PROMPT;
  const profile = background ? buildBackgroundDirective(background) : "";
  const scenarioDirective = scenario ? buildScenarioDirective(scenario) : "";
  // 预防式张力轴轮换：把上一节点的价值张力轴写进提示词，让模型主动避开，
  // 而不是等它写重复了再重试（消除"张力轴重复"这一类重试）。
  const axisHint = expectChoices && avoidAxis
    ? `【张力轴轮换】上一节点的价值张力轴是"${avoidAxis}"。本轮选项的张力轴必须与它不同（如理性/感性、服从/反叛、短利/长利、向内/向外、守成/创新、独行/合作、名声/自由、合群/独立、逃避/面对等），不要重复"${avoidAxis}"这一条。`
    : "";
  // 题材域层防重指令（预防式）：跨人生主线固定、单局内已离开方向逐轮动态，
  // 与张力轴一样放在提示词尾部，只作为追加后缀，不破坏 DeepSeek 前缀缓存。
  const storylineHint = buildStorylinePromptHint(storylineGuards);
  const openingHint = isOpening && scenario ? buildOpeningDirective(scenario) : "";
  const transitionHint = transitioning
    ? "【成年后的第一个决策节点】时间已经过去，你已长大到落地年龄（timePassed 之后的年龄）。写现在的你：新的处境、新的变化、新的细节；严禁复述上一条童年事件的故事或标题。必须给出 2~3 个方向真正不同、有具体立场的选项。"
    : "";
  const suffixes = [profile, scenarioDirective, themeHint, axisHint, storylineHint, openingHint, transitionHint].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return suffixes.length > 0 ? `${base}\n\n${suffixes.join("\n\n")}` : base;
}

