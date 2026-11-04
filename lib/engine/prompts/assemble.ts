import { buildBirthDirective, type BirthProfile } from "../../birth/profile";
import { OUTPUT_EXAMPLES } from "../output-format";
import { readFileSync } from "node:fs";
import path from "node:path";
import { buildBackgroundDirective, buildOpeningToneDirective, type LifeBackground } from "../../background";
import { buildStorylinePromptHint, type StorylineGuards } from "../../storyline";
import { buildOpeningDirective, buildScenarioDirective } from "../../modes/scenario";
import type { LifeScenario } from "../../modes/types";

// Markdown 维护叙事，output-format 维护 JSON；审阅标题不发送给模型。
function readPrompt(name: string): string {
  return readFileSync(path.join(process.cwd(), "lib/engine/prompts", `${name}.md`), "utf8")
    .replace(/^## .*\n/gm, "")
    .replace(/\n$/, "")
    .replace(/\{\{(\w+)\}\}/g, (_match, key: string) => {
      if (!Object.hasOwn(OUTPUT_EXAMPLES, key)) throw new Error(`未知提示词格式占位符：${key}`);
      return JSON.stringify(OUTPUT_EXAMPLES[key as keyof typeof OUTPUT_EXAMPLES]);
    });
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
  birth?: BirthProfile;
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
    birth,
    transitioning = false,
    avoidAxis,
    storylineGuards,
    scenario,
    isOpening = false,
    themeHint,
  } = options;
  const base = expectChoices ? SYSTEM_PROMPT : CHILDHOOD_SYSTEM_PROMPT;
  const eraHint = scenario?.mode === "normal" || scenario?.mode === "theme"
    ? "【当代生活背景】本局以当代中国为社会与生活背景。按现代的就业形态、住房、教育、交通、医疗、通信及家庭安排组织处境，不默认写成八九十年代或上世纪的生活。乡村、维修铺、制造业和老社区仍然存在，要写出它们当代的生活方式，不能一律怀旧；移动支付、网络交流等也不必每幕强塞。不要把地区或职业简化成落后/富裕的刻板印象。未提供具体公历年份时不自行钉死出生年份，不凭空预测未来重大技术或制度；用年龄推进人生，避免靠收音机、旧信件等意象把整局拉回旧时代。"
    : "";
  const profile = background
    ? birth
      ? buildOpeningToneDirective(background)
      : buildBackgroundDirective(background)
    : "";
  const scenarioDirective = scenario ? buildScenarioDirective(scenario) : "";
  // 近期价值课题用于防止复演，允许处境变化后的自然延续。
  const axisHint = expectChoices && avoidAxis
    ? `【张力轴轮换】上一节点的价值张力轴是"${avoidAxis}"。避免复演同样的处境与三项选择；若责任、资源或关系已有变化，可以继续这一课题，让上一行动的结果推进问题，而不是为了换轴另开事件。`
    : "";
  // 题材域层防重指令（预防式）：跨人生主线固定、单局内已离开方向逐轮动态，
  // 与张力轴一样放在提示词尾部，只作为追加后缀，不破坏 DeepSeek 前缀缓存。
  const storylineHint = buildStorylinePromptHint(storylineGuards);
  const openingHint = isOpening && scenario ? buildOpeningDirective(scenario) : "";
  const transitionHint = transitioning
    ? "【成年后的第一个决策节点】时间已经过去，你已长大到落地年龄（timePassed 之后的年龄）。写现在的你：新的处境、新的变化、新的细节；严禁复述上一条童年事件的故事或标题。必须给出 2~3 个方向真正不同、有具体立场的选项。"
    : "";
  const suffixes = [eraHint, birth ? buildBirthDirective(birth) : "", profile, scenarioDirective, themeHint, axisHint, storylineHint, openingHint, transitionHint].filter(
    (part): part is string => Boolean(part && part.trim()),
  );
  return suffixes.length > 0 ? `${base}\n\n${suffixes.join("\n\n")}` : base;
}

