import assembly from "./assembly.json";
import era from "./era.json";
import { renderPrompt } from "./template";
import { buildBirthDirective, type BirthProfile } from "../../birth/profile";
import { OUTPUT_EXAMPLES } from "../output-format";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBackgroundDirective, buildOpeningToneDirective, type LifeBackground } from "../../background";
import { buildStorylinePromptHint, type StorylineGuards } from "../../storyline";
import { buildOpeningDirective, buildScenarioDirective } from "../../modes/scenario";
import { renderOpeningDirective, type OpeningPlan } from "../../opening-plan";
import type { LifeScenario } from "../../modes/types";
import { CHILDHOOD_BOUNDARY } from "../phase";

// Markdown 维护成篇叙事与阶段指令；JSON 维护可替换片段、时代上下文与示例；TS 只组装，审阅标题不发送给模型。
function readPrompt(name: string): string {
  return readFileSync(path.join(process.cwd(), "lib/engine/prompts", `${name}.md`), "utf8")
    .replace(/^## .*\n/gm, "")
    .replace(/\n$/, "")
    .replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      if (!Object.hasOwn(OUTPUT_EXAMPLES, key)) throw new Error(`未知提示词格式占位符：${key}`);
      return JSON.stringify(OUTPUT_EXAMPLES[key as keyof typeof OUTPUT_EXAMPLES]);
    });
}

const CRAFT_PROMPT = readPrompt("craft");
const TERMINAL_SYSTEM_PROMPT = readPrompt("terminal");
const TWO_SCENE_SYSTEM_PROMPT = readPrompt("two-scene");
const V3_SYSTEM_PROMPT = `${CRAFT_PROMPT}\n\n${TWO_SCENE_SYSTEM_PROMPT}`;
const CHILDHOOD_OPENING_SYSTEM_PROMPT = readPrompt("opening");
const SYSTEM_PROMPT = readPrompt("adult");
export const CHILDHOOD_SYSTEM_PROMPT = readPrompt("childhood");
export const ENDING_SYSTEM_PROMPT = readPrompt("ending");

// 出身档案：见 lib/background.ts。每局开局由 start 路由掷出三维出身并写入 flags，
// 这里把本局出身档案作为系统提示词的固定后缀；同一局内前缀字节稳定，不破坏 DeepSeek 上下文缓存。
// 旧存档（无出身档案）返回基础提示词。
// transitioning=true 表示"成年后的第一个决策节点"（14 岁迈入 15+），追加专属指令：
// 时间已过去、写落地年龄的你、严禁复述上一条童年事件——修"14 岁节点内容在 18 岁重生成"。
export interface SystemPromptOptions {
  experienceVersion?: 3;
  isTerminal?: boolean;
  openingRecoveryAge?: number;
  birth?: BirthProfile;
  background?: LifeBackground;
  transitioning?: boolean;
  avoidAxis?: string | null;
  storylineGuards?: StorylineGuards;
  /** 玩法情境。普通人生为 undefined 或 normal。 */
  scenario?: LifeScenario;
  /** 首轮开场；剧本/ForU 会强制 timePassed=0。 */
  isOpening?: boolean;
  /** 普通模式的开局创作方向；只在本轮是开局（或开篇恢复）时注入。 */
  openingPlan?: OpeningPlan;
  /** 主题模式逐轮动态提醒，放在固定情境之后。 */
  themeHint?: string;
}

export function buildSystemPrompt(expectChoices: boolean, options: SystemPromptOptions = {}): string {
  const {
    background,
    birth,
    transitioning = false,
    avoidAxis,
    storylineGuards,
    scenario,
    isOpening = false,
    themeHint,
  } = options;
  const base = options.experienceVersion === 3 ? V3_SYSTEM_PROMPT : expectChoices ? SYSTEM_PROMPT : CHILDHOOD_SYSTEM_PROMPT;
  // 时代上下文单独成层：普通/主题使用默认当代；v3 的 ForU 也从当下生活开始；
  // 剧本的年代由 scenario.directive（mode-catalog 的 eraLabel/eraYears/eraSetting）承载，不能再叠加当代。
  const eraContext = scenario && (
    scenario.mode === "normal" ||
    scenario.mode === "theme" ||
    (options.experienceVersion === 3 && scenario.mode === "foru")
  ) ? renderPrompt(era.contemporary) : "";
  const profile = background
    ? birth
      ? buildOpeningToneDirective(background)
      : buildBackgroundDirective(background)
    : "";
  const scenarioDirective = scenario ? buildScenarioDirective(scenario) : "";
  // 近期价值课题用于防止复演，允许处境变化后的自然延续。
  const axisHint = expectChoices && avoidAxis
    ? renderPrompt(assembly.axisHint, { avoidAxis })
    : "";
  // 题材域层防重指令（预防式）：跨人生主线固定、单局内已离开方向逐轮动态，
  // 与张力轴一样放在提示词尾部，只作为追加后缀，不破坏 DeepSeek 前缀缓存。
  const storylineHint = buildStorylinePromptHint(storylineGuards);
  const openingHint = isOpening && scenario && options.experienceVersion !== 3 ? buildOpeningDirective(scenario) : "";
  const transitionHint = transitioning && options.experienceVersion !== 3
    ? renderPrompt(assembly.transitionHint)
    : "";
  const recoveryHint = options.experienceVersion === 3 && options.openingRecoveryAge !== undefined
    ? renderPrompt(assembly.recoveryHint, { fromAge: options.openingRecoveryAge, toAge: CHILDHOOD_BOUNDARY, timePassed: CHILDHOOD_BOUNDARY - options.openingRecoveryAge })
    : "";
  const childhoodOpening = options.experienceVersion === 3
    && (scenario?.mode === "normal" || scenario?.mode === "theme")
    && (isOpening || options.openingRecoveryAge !== undefined) ? CHILDHOOD_OPENING_SYSTEM_PROMPT : "";
  // 开局方向只在普通模式的开局（含开篇恢复）轮次追加；之后的轮次、主题、剧本、ForU 都不注入，
  // 避免"照护者/守住秘密"这类开局约束一路污染成年剧情。
  const openingPlanHint = options.experienceVersion === 3
    && scenario?.mode === "normal"
    && (isOpening || options.openingRecoveryAge !== undefined)
    ? renderOpeningDirective(options.openingPlan) : "";
  const suffixes = [eraContext, birth ? buildBirthDirective(birth) : "", profile, scenarioDirective, themeHint, axisHint, storylineHint, openingHint, transitionHint, childhoodOpening, openingPlanHint, recoveryHint, options.isTerminal ? TERMINAL_SYSTEM_PROMPT : ""].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return suffixes.length > 0 ? `${base}\n\n${suffixes.join("\n\n")}` : base;
}

