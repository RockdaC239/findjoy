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

export const ECONOMY_GUIDANCE: Record<FamilyEconomy, string> = {
  拮据: "住房普通甚至逼仄，父母为钱发愁，但家里可以是温暖的",
  普通: "普通工薪家庭，收支刚好平衡",
  小康: "父母收入稳定，有车有房，生活宽裕但不奢侈",
  富裕: "家境优渥，物质不缺，但期待与规矩也随之而来",
  大富: "家境显赫，物质极尽充裕，童年可能被安排、被保护，也可能被注视",
};

export const STRUCTURE_GUIDANCE: Record<FamilyStructure, string> = {
  双亲完整: "父母都在身边，婚姻完整；可自然设定独生或有兄弟姐妹",
  单亲: "由父亲或母亲一人抚养（离异或一方早逝），另一位照实存在或缺席",
  再婚家庭: "父母离异后有一方再婚，家里有继父/继母，也可能有继兄弟姐妹",
  留守隔代: "父母在外地打工或常年不在身边，由爷爷奶奶/外公外婆抚养",
  收养: "被收养长大，或从小在孤儿院/福利院长大",
};

export const EVENT_GUIDANCE: Record<OpeningEventGenre, string> = {
  安稳温暖: "写一件温暖的小事或家庭普通决定让生活有了第一次颜色（迎接新成员、搬进更好的住处、一次家庭旅行）；不写危机",
  机会降临: "写一个机会如何落到你面前：一次被托付的小事、接触新工具、进入新的生活环境、获得学习或参与的机会（机会的类型要多样：学业、手艺、机遇、贵人、平台，不一定要落在体育或艺术赛道上）；开局基调可以明亮一些",
  家庭变故: "写家庭的一次真实变故：失业、疾病、搬迁、父母分开或亲人离去；这只是多种可能之一，照实写即可，不渲染苦难",
  平凡开端: "没有大事发生，第一个有分量的决定来自你自己的愿望或好奇（想学一样东西、想交一个朋友、第一次独自出门）",
};

// 追加到本局系统提示词的固定后缀（同局内字节稳定，不破坏 DeepSeek 上下文缓存）。
export function buildBackgroundDirective(background: LifeBackground): string {
  return [
    "【本局出身档案】（只约束开局，之后人生自然发展；家庭经济与结构决定初始状态，故事要与之一致）",
    `- 家庭经济：${background.economy}——${ECONOMY_GUIDANCE[background.economy]}。`,
    `- 家庭结构：${background.structure}——${STRUCTURE_GUIDANCE[background.structure]}。`,
    ...(background.opportunity ? [`- 可接触的生活环境：${background.opportunity}。这是背景，不决定你的职业、天赋或性格；儿童只接触符合年龄的人和事，之后方向由选择发展。`] : []),
    `- 开局事件基调：${background.event}——${EVENT_GUIDANCE[background.event]}。`,
  ].join("\n");
}

// 有 BirthProfile 时只保留“开局事件基调”。经济、结构、地点和照护细节已经由
// 出生事实给出；再发送通用出身档案会与具体父母/住房/兄弟姐妹设定冲突
// （例如收养被写成孤儿院、双亲完整被写成一方早逝）。
export function buildOpeningToneDirective(background: LifeBackground): string {
  const guidance = background.event === "家庭变故"
    ? "写家庭的一次真实变故：失业、疾病、搬迁、照护压力等；开局不把出生档案中的同住父母改写成离异、缺席或死亡。此后的变化要有时间和因果。"
    : EVENT_GUIDANCE[background.event];
  return [
    "【本局开局事件基调】（只约束故事从哪里开始，不覆盖出生事实）",
    `- 基调：${background.event}——${guidance}。`,
    "出生地点、父母角色与数量、同住/异地/缺席状态、职业和家庭条件以【程序出生事实】为准。基调需要家庭变化时，只写不否定出生档案的变化；不补造档案之外的继亲、养父母、已故亲属、收养机构或债务原因。",
  ].join("\n");
}
