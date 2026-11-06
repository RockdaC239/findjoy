import modePrompts from "../engine/prompts/modes.json";
import { renderPrompt } from "../engine/prompts/template";
import type { EventType, LifeState, NextEvent } from "../life";
import { getEra, getScript, getTheme, isThemeId } from "./catalog";
import type {
  EconomyLevel,
  ForuBrief,
  HealthLevel,
  HousingLevel,
  LifeScenario,
  RelationshipLevel,
  ScriptDefinition,
  ScriptScenario,
  ScriptStart,
  ThemeId,
} from "./types";

export const NORMAL_SCENARIO: LifeScenario = { mode: "normal" };

const EVENT_TYPES: EventType[] = ["career", "relationship", "health", "finance", "random", "family"];
const ECONOMY_LEVELS: EconomyLevel[] = ["tight", "ordinary", "comfortable"];
const HEALTH_LEVELS: HealthLevel[] = ["good", "ordinary", "fragile"];
const HOUSING_LEVELS: HousingLevel[] = ["with_family", "rent", "own", "unspecified"];
const RELATIONSHIP_LEVELS: RelationshipLevel[] = [
  "single",
  "dating",
  "married",
  "divorced",
  "widowed",
  "complicated",
  "unspecified",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function cleanText(value: unknown, max: number): string {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").trim().slice(0, max);
}

function cleanInteger(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.round(value)));
}

function isEventType(value: unknown): value is EventType {
  return typeof value === "string" && (EVENT_TYPES as string[]).includes(value);
}

function isEconomyLevel(value: unknown): value is EconomyLevel {
  return typeof value === "string" && (ECONOMY_LEVELS as string[]).includes(value);
}

function isHealthLevel(value: unknown): value is HealthLevel {
  return typeof value === "string" && (HEALTH_LEVELS as string[]).includes(value);
}

function isHousingLevel(value: unknown): value is HousingLevel {
  return typeof value === "string" && (HOUSING_LEVELS as string[]).includes(value);
}

function isRelationshipLevel(value: unknown): value is RelationshipLevel {
  return typeof value === "string" && (RELATIONSHIP_LEVELS as string[]).includes(value);
}

export function normalizeForuBrief(value: unknown): ForuBrief | null {
  if (!isRecord(value)) return null;
  const age = cleanInteger(value.age, 1, 110, 0);
  const situation = cleanText(value.situation, 1200);
  if (age < 1 || !situation) return null;
  return {
    age,
    city: cleanText(value.city, 40),
    occupation: cleanText(value.occupation, 60),
    family: cleanText(value.family, 240),
    relationship: isRelationshipLevel(value.relationship) ? value.relationship : "unspecified",
    economy: isEconomyLevel(value.economy) ? value.economy : "ordinary",
    health: isHealthLevel(value.health) ? value.health : "ordinary",
    housing: isHousingLevel(value.housing) ? value.housing : "unspecified",
    situation,
    focus: cleanText(value.focus, 300),
  };
}

export type ForuValidation = { ok: true; brief: ForuBrief } | { ok: false; error: string };

export function validateForuBrief(value: unknown): ForuValidation {
  const brief = normalizeForuBrief(value);
  if (!brief) return { ok: false, error: "请填写你的年龄和当前处境。" };
  if (brief.age < 16 || brief.age > 90) return { ok: false, error: "ForU 目前支持 16~90 岁的人生起点。" };
  if (brief.situation.length < 10) return { ok: false, error: "请用至少 10 个字描述你现在的处境。" };
  return { ok: true, brief };
}

function normalizeScriptStart(value: unknown): ScriptStart | null {
  if (!isRecord(value)) return null;
  const age = cleanInteger(value.age, 1, 110, 0);
  const city = cleanText(value.city, 40);
  const occupation = cleanText(value.occupation, 60);
  if (age < 1 || !city || !occupation) return null;
  return {
    age,
    city,
    occupation,
    education: cleanText(value.education, 40) || undefined,
    finance: isEconomyLevel(value.finance) ? value.finance : undefined,
    cash: typeof value.cash === "number" && Number.isFinite(value.cash) ? Math.max(0, Math.round(value.cash)) : undefined,
    assets: typeof value.assets === "number" && Number.isFinite(value.assets) ? Math.max(0, Math.round(value.assets)) : undefined,
    debt: typeof value.debt === "number" && Number.isFinite(value.debt) ? Math.max(0, Math.round(value.debt)) : undefined,
    incomeYearly:
      typeof value.incomeYearly === "number" && Number.isFinite(value.incomeYearly)
        ? Math.max(0, Math.round(value.incomeYearly))
        : undefined,
    partnerStatus: cleanText(value.partnerStatus, 20) || undefined,
    physical:
      typeof value.physical === "number" && Number.isFinite(value.physical)
        ? Math.max(0, Math.min(100, Math.round(value.physical)))
        : undefined,
  };
}

function snapshotDirective(input: {
  title: string;
  eraLabel: string;
  eraYears: string;
  eraSetting: string;
  tagline: string;
  premise: string;
  hook: string;
  coreConflict: string;
  tone: string;
  startAge: number;
}): string {
  return renderPrompt(modePrompts.scriptSnapshot, input);
}

export function scriptToScenario(script: ScriptDefinition): ScriptScenario {
  const era = getEra(script.eraId);
  if (!era) throw new Error(`Unknown script era: ${script.eraId}`);
  return {
    mode: "script",
    scriptId: script.id,
    eraId: era.id,
    eraLabel: era.label,
    eraYears: era.years,
    title: script.title,
    tagline: script.tagline,
    premise: script.premise,
    hook: script.hook,
    coreConflict: script.coreConflict,
    tone: script.tone,
    eventType: script.eventType,
    start: { ...script.start },
    startAge: script.start.age,
    directive: snapshotDirective({
      title: script.title,
      eraLabel: era.label,
      eraYears: era.years,
      eraSetting: era.setting,
      tagline: script.tagline,
      premise: script.premise,
      hook: script.hook,
      coreConflict: script.coreConflict,
      tone: script.tone,
      startAge: script.start.age,
    }),
  };
}

function normalizeScriptScenario(value: Record<string, unknown>): LifeScenario {
  const scriptId = cleanText(value.scriptId, 80);
  const catalogScript = scriptId ? getScript(scriptId) : undefined;
  const start = normalizeScriptStart(value.start);
  const title = cleanText(value.title, 80);
  const premise = cleanText(value.premise, 1200);
  const hook = cleanText(value.hook, 800);
  // 存档快照完整时优先保留，保证旧人生在目录改版后仍按开局设定继续；
  // 快照缺字段则用目录补齐，目录已下线时才回退普通模式。
  if (!start || !title || !premise || !hook) {
    return catalogScript ? scriptToScenario(catalogScript) : NORMAL_SCENARIO;
  }

  const era = getEra(cleanText(value.eraId, 40));
  const eraLabel = cleanText(value.eraLabel, 40) || era?.label || "未知年代";
  const eraYears = cleanText(value.eraYears, 40) || era?.years || "";
  const coreConflict = cleanText(value.coreConflict, 500);
  const tone = cleanText(value.tone, 120);
  const tagline = cleanText(value.tagline, 160);
  const directive =
    cleanText(value.directive, 6000) ||
    snapshotDirective({
      title,
      eraLabel,
      eraYears,
      eraSetting: era?.setting ?? "",
      tagline,
      premise,
      hook,
      coreConflict,
      tone,
      startAge: start.age,
    });

  return {
    mode: "script",
    scriptId: scriptId || "archived-script",
    eraId: era?.id ?? cleanText(value.eraId, 40),
    eraLabel,
    eraYears,
    title,
    tagline,
    premise,
    hook,
    coreConflict,
    tone,
    eventType: isEventType(value.eventType) ? value.eventType : "random",
    start,
    startAge: start.age,
    directive,
  };
}

/** 旧存档没有 scenario 字段；损坏或未知模式一律回退普通模式，保证可继续。 */
export function normalizeLifeScenario(value: unknown): LifeScenario {
  if (!isRecord(value)) return NORMAL_SCENARIO;
  if (value.mode === "theme" && isThemeId(value.theme)) {
    return { mode: "theme", theme: value.theme };
  }
  if (value.mode === "script") return normalizeScriptScenario(value);
  if (value.mode === "foru") {
    const brief = normalizeForuBrief(value.brief);
    return brief ? { mode: "foru", brief } : NORMAL_SCENARIO;
  }
  return NORMAL_SCENARIO;
}

export function getLifeScenario(state: { scenario?: unknown } | null | undefined): LifeScenario {
  return normalizeLifeScenario(state?.scenario);
}

export function buildScenarioDirective(scenario: LifeScenario): string {
  if (scenario.mode === "normal") return "";
  if (scenario.mode === "script") return scenario.directive;
  if (scenario.mode === "theme") {
    const theme = getTheme(scenario.theme);
    if (!theme) return "";
    return renderPrompt(modePrompts.themeScenario, { label: theme.label, description: theme.description, focus: theme.focus.join("、") });
  }
  const brief = scenario.brief;
  return renderPrompt(modePrompts.foruScenario, { briefJson: JSON.stringify(brief), age: brief.age });
}

export function buildOpeningDirective(scenario: LifeScenario): string {
  if (scenario.mode === "normal" || scenario.mode === "theme") return "";
  const age = scenario.mode === "script" ? scenario.startAge : scenario.brief.age;
  return renderPrompt(modePrompts.opening, { age });
}

/** 主题模式每隔两轮检查一次是否偏离主线，偏离时在下一轮强制拉回。 */
export function buildThemeTurnHint(scenario: LifeScenario, state: Pick<LifeState, "history">): string {
  if (scenario.mode !== "theme") return "";
  const theme = getTheme(scenario.theme);
  if (!theme) return "";
  const history = state.history;
  if (history.length === 0) {
    return renderPrompt(modePrompts.themeOpening, { label: theme.label });
  }
  let offTheme = 0;
  for (let index = history.length - 1; index >= 0 && offTheme < 3; index -= 1) {
    const type = history[index]?.type;
    if (type && theme.eventTypes.includes(type)) break;
    offTheme += 1;
  }
  if (offTheme < 2) return "";
  return renderPrompt(modePrompts.themeTurnReminder, { offTheme, label: theme.label });
}

export function buildScenarioReviewDirective(scenario: LifeScenario): string {
  if (scenario.mode === "normal") return "";
  if (scenario.mode === "script") {
    return renderPrompt(modePrompts.scriptReview);
  }
  if (scenario.mode === "theme") {
    const theme = getTheme(scenario.theme);
    return theme
      ? renderPrompt(modePrompts.themeReview, { label: theme.label })
      : "";
  }
  return renderPrompt(modePrompts.foruReview);
}

export function getScenarioReviewQuestion(scenario: LifeScenario): string {
  if (scenario.mode === "theme") {
    const theme = getTheme(scenario.theme);
    return `这一生里，${theme?.label ?? "这条主线"}把你带到了哪里？`;
  }
  if (scenario.mode === "script") return "如果这是别人的人生，你会怎样理解他/她的选择？";
  if (scenario.mode === "foru") return "回到你写下的现在，这次推演让你看见了什么？";
  return "如果这是你真实的一生，你愿意这样活吗？";
}

export function getScenarioLabel(scenario: LifeScenario): {
  label: string;
  detail: string;
  eyebrow: string;
} {
  if (scenario.mode === "theme") {
    const theme = getTheme(scenario.theme);
    return {
      label: `${theme?.label ?? "主题"}人生`,
      detail: `主题模式 · ${theme?.tagline ?? "一条主线"}`,
      eyebrow: "THEME",
    };
  }
  if (scenario.mode === "script") {
    return {
      label: scenario.title,
      detail: `${scenario.eraLabel} · ${scenario.startAge} 岁开场`,
      eyebrow: "SCRIPT",
    };
  }
  if (scenario.mode === "foru") {
    return {
      label: "ForU 模式",
      detail: `${scenario.brief.age} 岁出发`,
      eyebrow: "FOR YOU",
    };
  }
  return { label: "普通模式", detail: "随机出身 · 从 0 岁开始", eyebrow: "CLASSIC" };
}

export function getScenarioShortLabel(scenario: LifeScenario): string {
  if (scenario.mode === "theme") return getTheme(scenario.theme)?.label ?? "主题";
  if (scenario.mode === "script") return "剧本";
  if (scenario.mode === "foru") return "ForU";
  return "普通";
}

/** 模型连续失败时的兜底开局。至少让剧本/ForU 的第一幕落在正确年龄与情境里。 */
export function buildScenarioFallbackEvent(state: LifeState, scenario: LifeScenario): NextEvent | null {
  if (state.history.length > 0) return null;
  const choices = [
    { id: "A", text: "先抓住眼前的机会，走一步看一步" },
    { id: "B", text: "把话说清楚，再决定要不要答应" },
    { id: "C", text: "暂时退一步，先弄清背后的代价" },
  ];
  if (scenario.mode === "script") {
    return {
      timePassed: 0,
      story: `你${scenario.startAge}岁。${scenario.hook} 这句话落下之后，屋里的人都在等你回应。你知道，今天的选择会把之后很多年带到不同的方向。`,
      event: { type: scenario.eventType, title: scenario.title, importance: 0.85 },
      choices,
      objectiveChanges: {},
      memory: `在「${scenario.title}」的开场，你第一次意识到自己必须为接下来的人生表态。`,
    };
  }
  if (scenario.mode === "foru") {
    const brief = scenario.brief;
    return {
      timePassed: 0,
      story: `你${brief.age}岁，生活在${brief.city || state.basic.city}。${brief.situation} 此刻，一个需要你回应的变化来到面前，你知道自己不能再拖下去。`,
      event: { type: "random", title: "此刻的选择", importance: 0.82 },
      choices,
      objectiveChanges: {},
      memory: `在日常的缝隙里，你第一次认真想过：接下来的人生要不要换一种走法。`,
    };
  }
  if (scenario.mode === "theme") {
    const theme = getTheme(scenario.theme);
    if (!theme) return null;
    const fallbackByTheme: Record<ThemeId, { type: EventType; title: string; story: string; memory: string }> = {
      love: {
        type: "relationship",
        title: "父母之间的一次沉默",
        story: "你五岁，第一次发现父母之间也会用沉默说话。晚饭后，母亲在阳台站了很久，父亲把电视声音调小。你坐在门口，不知道该不该过去。",
        memory: "五岁那年，你第一次感到两个人之间的距离。",
      },
      family: {
        type: "family",
        title: "家里决定谁去外地",
        story: "你五岁，家里为了谁去外地工作争执了几次。最后决定是母亲走，父亲留下来照顾你。你还不懂这意味着什么，只记得她出门前把你的衣服叠了又叠。",
        memory: "五岁那年，你开始知道家人的离开和留下会改变日常。",
      },
      career: {
        type: "career",
        title: "父亲工作的地方",
        story: "你五岁，父亲带你去他工作的厂区。机器的声音很大，他把你抱到窗边，说以后要好好读书，别像他一样。你第一次看见他工作的地方。",
        memory: "五岁那年，你第一次看见父亲工作时的样子。",
      },
    };
    const fallback = fallbackByTheme[scenario.theme];
    return {
      timePassed: 5,
      story: fallback.story,
      event: { type: fallback.type, title: fallback.title, importance: 0.7 },
      choices: [],
      objectiveChanges: {},
      memory: fallback.memory,
    };
  }
  return null;
}

export function themeIdForScenario(scenario: LifeScenario): ThemeId | null {
  return scenario.mode === "theme" ? scenario.theme : null;
}
