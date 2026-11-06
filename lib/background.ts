import prompt from "./engine/prompts/background.json";
import { renderPrompt } from "./engine/prompts/template";
// 出身档案：开局随机生成的三维家庭底色（家庭经济 × 家庭结构 × 开局事件）。
// 由 start 路由掷出并写入 state.flags，决定初始经济状态，并作为本局系统提示词的固定后缀。
// 三维正交，5 × 5 × 4 = 100 种组合，覆盖大多数人生的开局底色；
// 家庭变故只作为"开局事件"四分之一的可能性，且经济/结构本身已自带多样性，
// 不再默认"惨"。性格与天赋不由系统定义：玩家会用自己的真实底色做抉择，系统只给情景和人生。

export const FAMILY_ECONOMY = ["拮据", "普通", "小康", "富裕", "大富"] as const;
export type FamilyEconomy = (typeof FAMILY_ECONOMY)[number];

export const FAMILY_STRUCTURE = ["双亲完整", "单亲", "再婚家庭", "留守隔代", "收养"] as const;
export type FamilyStructure = (typeof FAMILY_STRUCTURE)[number];

export const OPENING_EVENT_GENRES = ["安稳温暖", "机会降临", "家庭变故", "平凡开端"] as const;
export type OpeningEventGenre = (typeof OPENING_EVENT_GENRES)[number];

// 机会环境是编辑覆盖范围，不是人口概率或预定职业。
export const OPPORTUNITY_SETTINGS = [
  "社区小店与熟客往来", "工厂家属区与轮班生活", "乡镇农忙与邻里互助",
  "公共图书馆与普通学校", "运输站点与流动人口", "街坊维修铺与手艺传承",
  "社区照护与代际相处", "办公室家庭与通勤生活", "市场摊位与进货往来",
  "新搬入的小区与陌生邻居", "基层公共服务与办事窗口", "社区运动与文艺活动",
] as const;
export type OpportunitySetting = (typeof OPPORTUNITY_SETTINGS)[number];

export interface LifeBackground {
  economy: FamilyEconomy;
  structure: FamilyStructure;
  event: OpeningEventGenre;
  opportunity?: OpportunitySetting;
}

// 概率权重：经济/结构参考现实分布，但为了让玩家有更多可玩的开局，
// 富裕+大富合计提到约25%；仍低于“拮据+普通”的45%，也低于“普通”单独的35%。
// 这是产品调优权重，不是现实收入分布。
function pickWeighted<T>(random: () => number, entries: Array<[T, number]>, avoid: ReadonlyArray<T> = []): T {
  const avoided = new Set(avoid);
  const pool = entries.map(([value, weight]) => [value, avoided.has(value) ? weight * 0.5 : weight] as [T, number]);
  const total = pool.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of pool) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return pool[pool.length - 1][0];
}

// 新一局开局出身滚动。avoid 传入最近几局已用过的维度取值，
// 让连续的人生不要总落在同一条线上（例如反复"再婚家庭 + 家庭变故"）。
// 近期取值只降权，不彻底排除；这样不会因为最近六局覆盖了少数派而把分布压成单值。
export interface BackgroundAvoid {
  provinceCodes?: readonly string[];
  occupationIds?: readonly string[];
  economy?: ReadonlyArray<FamilyEconomy>;
  structure?: ReadonlyArray<FamilyStructure>;
  event?: ReadonlyArray<OpeningEventGenre>;
  opportunity?: ReadonlyArray<OpportunitySetting>;
}

export type Settlement = "城区" | "县城" | "乡镇" | "乡村";
export interface RollBackgroundOptions {
  /**
   * 普通/主题人生的出生地点、照护与通勤已由 BirthProfile 生成；
   * 此时不再额外抽一个可能与出生地矛盾的生活机会环境。旧存档仍可读取。
   */
  includeOpportunity?: boolean;
  /** 同一全国权重下再按城乡做轻度经济先验：城市富裕略高，乡村略低。 */
  settlement?: Settlement;
}

const BASE_ECONOMY_WEIGHTS: Array<[FamilyEconomy, number]> = [
  ["拮据", 10], ["普通", 35], ["小康", 30], ["富裕", 20], ["大富", 5],
];
const SETTLEMENT_ECONOMY_WEIGHTS: Record<Settlement, Array<[FamilyEconomy, number]>> = {
  城区: [["拮据", 9], ["普通", 34], ["小康", 28], ["富裕", 24], ["大富", 5]],
  县城: [["拮据", 11], ["普通", 38], ["小康", 30], ["富裕", 17], ["大富", 4]],
  乡镇: [["拮据", 12], ["普通", 40], ["小康", 30], ["富裕", 15], ["大富", 3]],
  乡村: [["拮据", 14], ["普通", 42], ["小康", 30], ["富裕", 12], ["大富", 2]],
};

export function rollBackground(random: () => number = Math.random, avoid: BackgroundAvoid = {}, options: RollBackgroundOptions = {}): LifeBackground {
  const economyWeights = options.settlement ? SETTLEMENT_ECONOMY_WEIGHTS[options.settlement] : BASE_ECONOMY_WEIGHTS;
  return {
    ...(options.includeOpportunity === false
      ? {}
      : { opportunity: pickWeighted(random, OPPORTUNITY_SETTINGS.map(value => [value, 1]), avoid.opportunity) }),
    economy: pickWeighted(random, economyWeights, avoid.economy),
    structure: pickWeighted(random, [["双亲完整", 68], ["单亲", 12], ["再婚家庭", 7], ["留守隔代", 8], ["收养", 5]], avoid.structure),
    event: pickWeighted(random, [["安稳温暖", 30], ["机会降临", 25], ["家庭变故", 25], ["平凡开端", 20]], avoid.event),
  };
}

// 经济底色 → 初始财务状态（与开局文案一致，避免"台词说有钱、状态显示 8000 块"的脱节）。
export function backgroundToFinance(background: Pick<LifeBackground, "economy">): { cash: number; assets: number; debt: number } {
  switch (background.economy) {
    case "拮据":
      return { cash: 2000, assets: 2000, debt: 20000 };
    case "普通":
      return { cash: 8000, assets: 8000, debt: 0 };
    case "小康":
      return { cash: 50000, assets: 120000, debt: 0 };
    case "富裕":
      return { cash: 300000, assets: 600000, debt: 0 };
    case "大富":
      return { cash: 1200000, assets: 3000000, debt: 0 };
  }
}

// 展平写入 flags（flags 类型为标量 Record，避免嵌套对象），
// 同时让出身档案随 state 持久化、可追溯。
export function backgroundToFlags(background: LifeBackground): Record<string, string> {
  return {
    ...(background.opportunity ? { bgOpportunity: background.opportunity } : {}),
    bgEconomy: background.economy,
    bgStructure: background.structure,
    bgEvent: background.event,
  };
}

export function flagsToBackground(flags: Record<string, unknown>): LifeBackground | undefined {
  const { bgEconomy, bgStructure, bgEvent } = flags;
  if (typeof bgEconomy !== "string" || typeof bgStructure !== "string" || typeof bgEvent !== "string") return undefined;
  if (!(FAMILY_ECONOMY as readonly string[]).includes(bgEconomy)) return undefined;
  if (!(FAMILY_STRUCTURE as readonly string[]).includes(bgStructure)) return undefined;
  if (!(OPENING_EVENT_GENRES as readonly string[]).includes(bgEvent)) return undefined;
  return { economy: bgEconomy as FamilyEconomy, structure: bgStructure as FamilyStructure, event: bgEvent as OpeningEventGenre, ...(OPPORTUNITY_SETTINGS.includes(flags.bgOpportunity as OpportunitySetting) ? { opportunity: flags.bgOpportunity as OpportunitySetting } : {}) };
}

export const ECONOMY_GUIDANCE: Record<FamilyEconomy, string> = prompt.ECONOMY_GUIDANCE;

export const STRUCTURE_GUIDANCE: Record<FamilyStructure, string> = prompt.STRUCTURE_GUIDANCE;

export const EVENT_GUIDANCE: Record<OpeningEventGenre, string> = prompt.EVENT_GUIDANCE;

// 追加到本局系统提示词的固定后缀（同局内字节稳定，不破坏 DeepSeek 上下文缓存）。
export function buildBackgroundDirective(background: LifeBackground): string {
  return [
    prompt.heading,
    renderPrompt(prompt.economy, { economy: background.economy, guidance: ECONOMY_GUIDANCE[background.economy] }),
    renderPrompt(prompt.structure, { structure: background.structure, guidance: STRUCTURE_GUIDANCE[background.structure] }),
    ...(background.opportunity ? [renderPrompt(prompt.opportunity, { opportunity: background.opportunity })] : []),
    renderPrompt(prompt.event, { event: background.event, guidance: EVENT_GUIDANCE[background.event] }),
  ].join("\n");
}

// 有 BirthProfile 时只保留“开局事件基调”。经济、结构、地点和照护细节已经由
// 出生事实给出；再发送通用出身档案会与具体父母/住房/兄弟姐妹设定冲突
// （例如收养被写成孤儿院、双亲完整被写成一方早逝）。
export function buildOpeningToneDirective(background: LifeBackground): string {
  const guidance = background.event === "家庭变故"
    ? prompt.upheavalGuidance
    : EVENT_GUIDANCE[background.event];
  return [
    prompt.toneHeading,
    renderPrompt(prompt.tone, { event: background.event, guidance: guidance }),
    prompt.birthBoundary,
  ].join("\n");
}
