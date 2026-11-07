import catalog from "./engine/prompts/opening-plan.json";
import { renderPrompt } from "./engine/prompts/template";

// 开局方向：主要关系 × 推动力 × 故事机制 × 代价类型。
// 代价单独成一维，是因为真实样本里模型总把"给你多少钱"当成唯一具体的代价；
// 结构化了代价，才能在不写雇佣的情况下仍然给出有分量的选择。
// 这里只做枚举、抽样、校验与组装；创作描述全部在 opening-plan.json 里维护。
// 它不是预写剧情，也不预定成年职业：同一机制可以写成完全不同的处境。
export type OpeningDimension = "relationship" | "driver" | "mechanism" | "stakes";

export interface OpeningOption {
  id: string;
  label: string;
  weight: number;
  hint: string;
}

export interface OpeningCombo {
  relationship: string;
  driver: string;
  mechanism: string;
  stakes: string;
}

export interface OpeningPlan extends OpeningCombo {
  version: 1;
  /**
   * 抽样时参考的最近几局组合（最多 4 组），只用于在开局提示词里说明"最近用过什么"。
   * 存组合而不是存逐维 id：逐维列表会和本局方向自相矛盾（"最近用过同龄朋友"却要求写同龄朋友）。
   */
  recent?: OpeningCombo[];
}

export const OPENING_DIMENSIONS: OpeningDimension[] = ["relationship", "driver", "mechanism", "stakes"];

const RECENT_WEIGHT = 0.15;
const MAX_RECENT = 4;
const MAX_COMBO_RETRY = 12;

function optionsFor(dimension: OpeningDimension): OpeningOption[] {
  const raw: unknown = (catalog.dimensions as Record<string, unknown>)[dimension];
  if (!Array.isArray(raw)) return [];
  const options: OpeningOption[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const entry = item as Record<string, unknown>;
    if (typeof entry.id !== "string" || !entry.id || options.some(option => option.id === entry.id)) continue;
    if (typeof entry.label !== "string" || !entry.label) continue;
    if (typeof entry.hint !== "string" || !entry.hint) continue;
    const weight = typeof entry.weight === "number" && Number.isFinite(entry.weight) && entry.weight > 0 ? entry.weight : 1;
    options.push({ id: entry.id, label: entry.label, hint: entry.hint, weight });
  }
  return options;
}

export function openingOptions(dimension: OpeningDimension): OpeningOption[] {
  return optionsFor(dimension);
}

export function openingLabel(dimension: OpeningDimension, id: string): string | undefined {
  return optionsFor(dimension).find(option => option.id === id)?.label;
}

function roll(random: () => number, options: OpeningOption[], avoided: ReadonlySet<string>): OpeningOption {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("开局方向抽样需要[0,1)随机数");
  const weights = options.map(option => option.weight * (avoided.has(option.id) ? RECENT_WEIGHT : 1));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let ticket = value * total;
  for (let index = 0; index < options.length; index++) {
    ticket -= weights[index];
    if (ticket < 0) return options[index];
  }
  return options[options.length - 1];
}

function recentCombos(plan: OpeningPlan): OpeningCombo[] {
  return Array.isArray(plan.recent) ? plan.recent : [];
}

/** 校验存档/请求里的开局方向；未知 id 视为无效，不把自由文本带进提示词。 */
export function validateOpeningPlan(value: unknown): OpeningPlan | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const row = value as Record<string, unknown>;
  if (row.version !== 1) return undefined;
  if (OPENING_DIMENSIONS.some(dimension => typeof row[dimension] !== "string" || !openingLabel(dimension, row[dimension] as string))) return undefined;
  const recent: OpeningCombo[] = [];
  if (Array.isArray(row.recent)) {
    for (const item of row.recent) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;
      const combo = item as Record<string, unknown>;
      if (OPENING_DIMENSIONS.some(dimension => typeof combo[dimension] !== "string" || !openingLabel(dimension, combo[dimension] as string))) continue;
      recent.push({ relationship: combo.relationship as string, driver: combo.driver as string, mechanism: combo.mechanism as string, stakes: combo.stakes as string });
      if (recent.length >= MAX_RECENT) break;
    }
  }
  return { version: 1, relationship: row.relationship as string, driver: row.driver as string, mechanism: row.mechanism as string, stakes: row.stakes as string, ...(recent.length ? { recent } : {}) };
}

function comboOf(plan: OpeningCombo): string {
  return `${plan.relationship}|${plan.driver}|${plan.mechanism}|${plan.stakes}`;
}

/**
 * 抽样本局开局方向。
 * - 近期用过的同一 id 降权，而不是硬排除，避免少数派被压成单值；
 * - 四元组与最近几局完全相同时有限次重抽，仍相同则接受（不能保证永不重复）。
 * 计划由调用方随开局状态持久化；同一个幂等请求不应重新抽样。
 */
export function sampleOpeningPlan(random: () => number = Math.random, recent: readonly OpeningPlan[] = []): OpeningPlan {
  const avoided: Record<OpeningDimension, Set<string>> = {
    relationship: new Set(recent.map(plan => plan.relationship)),
    driver: new Set(recent.map(plan => plan.driver)),
    mechanism: new Set(recent.map(plan => plan.mechanism)),
    stakes: new Set(recent.map(plan => plan.stakes)),
  };
  const seenCombos = new Set(recent.map(comboOf));
  const dimensions = {
    relationship: optionsFor("relationship"),
    driver: optionsFor("driver"),
    mechanism: optionsFor("mechanism"),
    stakes: optionsFor("stakes"),
  };
  if (OPENING_DIMENSIONS.some(dimension => dimensions[dimension].length === 0)) throw new Error("开局方向目录为空");
  let picked: OpeningPlan = { version: 1, relationship: "", driver: "", mechanism: "", stakes: "" };
  for (let attempt = 0; attempt < MAX_COMBO_RETRY; attempt++) {
    picked = {
      version: 1,
      relationship: roll(random, dimensions.relationship, avoided.relationship).id,
      driver: roll(random, dimensions.driver, avoided.driver).id,
      mechanism: roll(random, dimensions.mechanism, avoided.mechanism).id,
      stakes: roll(random, dimensions.stakes, avoided.stakes).id,
    };
    if (!seenCombos.has(comboOf(picked))) break;
  }
  const stored = [...new Set(recent.map(comboOf))].map(text => {
    const [relationship, driver, mechanism, stakes] = text.split("|");
    return { relationship, driver, mechanism, stakes };
  }).slice(0, MAX_RECENT);
  return { ...picked, ...(stored.length ? { recent: stored } : {}) };
}

function recentLabels(plan: OpeningPlan): string {
  return recentCombos(plan).map(combo => OPENING_DIMENSIONS
    .map(dimension => openingLabel(dimension, combo[dimension]))
    .filter((label): label is string => Boolean(label))
    .join("＋"))
    .filter(Boolean)
    .join("；");
}

/** 开局提示词只描述方向与边界，不预写人物、地点、道具或职业。 */
export function renderOpeningDirective(plan: OpeningPlan | undefined): string {
  if (!plan) return "";
  const relationship = openingOptions("relationship").find(option => option.id === plan.relationship);
  const driver = openingOptions("driver").find(option => option.id === plan.driver);
  const mechanism = openingOptions("mechanism").find(option => option.id === plan.mechanism);
  const stakes = openingOptions("stakes").find(option => option.id === plan.stakes);
  if (!relationship || !driver || !mechanism || !stakes) return "";
  const parts = [renderPrompt(catalog.directive, {
    relationship: relationship.label,
    relationshipHint: relationship.hint,
    driver: driver.label,
    driverHint: driver.hint,
    mechanism: mechanism.label,
    mechanismHint: mechanism.hint,
    stakes: stakes.label,
    stakesHint: stakes.hint,
  })];
  const used = recentLabels(plan);
  if (used) parts.push(renderPrompt(catalog.recent, { used }));
  return parts.join("\n");
}
