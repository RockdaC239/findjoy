// 出身档案：开局随机生成的四维家庭底色（家庭经济 × 家庭结构 × 开局事件 × 天赋）。
// 由 start 路由掷出并写入 state.flags，决定初始经济状态，并作为本局系统提示词的固定后缀。
// 四维正交，5 × 5 × 4 × 6 = 600 种组合，覆盖大多数人生的开局底色；
// 家庭变故只作为"开局事件"四分之一的可能性，且经济/结构/天赋本身已自带多样性，
// 不再默认"惨"。

export const FAMILY_ECONOMY = ["拮据", "普通", "小康", "富裕", "大富"] as const;
export type FamilyEconomy = (typeof FAMILY_ECONOMY)[number];

export const FAMILY_STRUCTURE = ["双亲完整", "单亲", "再婚家庭", "留守隔代", "收养"] as const;
export type FamilyStructure = (typeof FAMILY_STRUCTURE)[number];

export const OPENING_EVENT_GENRES = ["安稳温暖", "机会降临", "家庭变故", "平凡开端"] as const;
export type OpeningEventGenre = (typeof OPENING_EVENT_GENRES)[number];

export const TALENTS = ["无", "艺术", "运动", "学业", "社交", "动手"] as const;
export type Talent = (typeof TALENTS)[number];

export interface LifeBackground {
  economy: FamilyEconomy;
  structure: FamilyStructure;
  event: OpeningEventGenre;
  talent: Talent;
}

// 概率权重：经济/结构参考现实分布（普通与小康为主，大富稀有；双亲完整为主，单亲/留守/隔代/收养为少数）；
// 事件基调四等分偏置一点（安稳与机会略高于变故），天赋半数无、其余均摊。
function pickWeighted<T>(random: () => number, entries: Array<[T, number]>): T {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  for (const [value, weight] of entries) {
    roll -= weight;
    if (roll < 0) return value;
  }
  return entries[entries.length - 1][0];
}

export function rollBackground(random: () => number = Math.random): LifeBackground {
  return {
    economy: pickWeighted(random, [["拮据", 12], ["普通", 38], ["小康", 32], ["富裕", 14], ["大富", 4]]),
    structure: pickWeighted(random, [["双亲完整", 68], ["单亲", 12], ["再婚家庭", 7], ["留守隔代", 8], ["收养", 5]]),
    event: pickWeighted(random, [["安稳温暖", 30], ["机会降临", 25], ["家庭变故", 25], ["平凡开端", 20]]),
    talent: pickWeighted(random, [["无", 50], ["艺术", 10], ["运动", 10], ["学业", 12], ["社交", 10], ["动手", 8]]),
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
    bgEconomy: background.economy,
    bgStructure: background.structure,
    bgEvent: background.event,
    bgTalent: background.talent,
  };
}

export function flagsToBackground(flags: Record<string, unknown>): LifeBackground | undefined {
  const { bgEconomy, bgStructure, bgEvent, bgTalent } = flags;
  if (typeof bgEconomy !== "string" || typeof bgStructure !== "string" || typeof bgEvent !== "string" || typeof bgTalent !== "string") return undefined;
  if (!(FAMILY_ECONOMY as readonly string[]).includes(bgEconomy)) return undefined;
  if (!(FAMILY_STRUCTURE as readonly string[]).includes(bgStructure)) return undefined;
  if (!(OPENING_EVENT_GENRES as readonly string[]).includes(bgEvent)) return undefined;
  if (!(TALENTS as readonly string[]).includes(bgTalent)) return undefined;
  return { economy: bgEconomy as FamilyEconomy, structure: bgStructure as FamilyStructure, event: bgEvent as OpeningEventGenre, talent: bgTalent as Talent };
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
  安稳温暖: "写一件温暖的小事或家庭普通决定让生活有了第一次颜色（迎接新成员、搬进更好的住处、一次家庭旅行）；不写危机，不写天赋",
  机会降临: "写一个机会如何落到你面前：被教练/老师看中、比赛获奖、收到意外的邀请或资助；开局基调可以明亮一些",
  家庭变故: "写家庭的一次真实变故：失业、疾病、搬迁、父母分开或亲人离去；这只是多种可能之一，照实写即可，不渲染苦难",
  平凡开端: "没有大事发生，第一个有分量的决定来自你自己的愿望或好奇（想学一样东西、想交一个朋友、第一次独自出门）",
};

export const TALENT_GUIDANCE: Record<Talent, string> = {
  无: "无需在开局特别体现",
  艺术: "对音乐、绘画或手工有天然的感觉",
  运动: "身体协调、跑得快、力气大",
  学业: "记性好、学得快、爱读书",
  社交: "自来熟、讨人喜欢、朋友多",
  动手: "手巧，喜欢拆装东西、做小玩意儿",
};

// 追加到本局系统提示词的固定后缀（同局内字节稳定，不破坏 DeepSeek 上下文缓存）。
export function buildBackgroundDirective(background: LifeBackground): string {
  return [
    "【本局出身档案】（只约束开局，之后人生自然发展；家庭经济与结构决定初始状态，故事要与之一致）",
    `- 家庭经济：${background.economy}——${ECONOMY_GUIDANCE[background.economy]}。`,
    `- 家庭结构：${background.structure}——${STRUCTURE_GUIDANCE[background.structure]}。`,
    `- 开局事件基调：${background.event}——${EVENT_GUIDANCE[background.event]}。`,
    `- 天赋：${background.talent}——${TALENT_GUIDANCE[background.talent]}。`,
  ].join("\n");
}
