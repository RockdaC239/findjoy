import { renderPrompt } from "./engine/prompts/template";
import prompt from "./engine/prompts/storyline.json";
// 职业域用于跨局多样性提醒，不代表完整剧情，也不用于拒绝玩家主动选择。
// 同职业可以有不同处境；离开旧方向后仍允许回归。检测只看职业载体，避免将家庭病情误作医疗职业。
import type { LifeState } from "./life";

export interface StorylineDomain {
  key: string;
  label: string;
  pattern: RegExp;
}

// 模式只匹配"职业/主线级"词，不匹配业余爱好语境（如"踢球""画画"作为消遣不应命中），
// 降低"周末踢个球被当成体育人生"这类误判。个别词汇跨域（如"音乐老师"）会同时命中多个域，
// 多域命中仅提供编辑提醒，不触发重试或强迫玩家转行。
export const STORYLINE_DOMAINS: StorylineDomain[] = [
  { key: "sports", label: "体育竞技", pattern: /体育|运动员|职业球员|体校|省队|国家队|田径|运动队|教练|赛事|球探/ },
  { key: "arts", label: "艺术创作", pattern: /艺术|美术|艺考|音乐学院|美术学院|音乐|钢琴|舞蹈|演艺|演员|歌手|画展|画廊|插画|画家|乐队|作曲/ },
  { key: "startup", label: "创业经商", pattern: /创业|开公司|做生意|开店|融资|合伙人|经商|老板|个体户|创业公司/ },
  { key: "medical", label: "医疗健康", pattern: /医生|护士|从医|行医|医学院|临床|大夫/ },
  { key: "education", label: "教育", pattern: /教师|老师|教书|教职|执教|师范|培训师|班主任|教授/ },
  { key: "tech", label: "技术研发", pattern: /程序员|软件|工程师|研发|互联网|编程|写代码|开发岗|科技公司|产品经理|技术岗/ },
  { key: "construction", label: "建筑规划", pattern: /建筑|规划|测绘|土木|施工|设计院|绘图员|造价/ },
  { key: "manufacturing", label: "生产制造", pattern: /制造|车间|机床|加工|工艺|机械|机电|电工|焊接|装配|质检|产线|生产线/ },
  { key: "repair", label: "维修技工", pattern: /维修|修理|汽修|修车|机修|钳工|技师|售后|4S/ },
  { key: "finance", label: "财务金融", pattern: /会计|财务|金融|银行|投资|证券|审计|出纳|理财/ },
  { key: "government", label: "体制公职", pattern: /公务员|体制内|机关|国企|事业单位|政府|干部|警察|消防|救援/ },
  { key: "media", label: "文字媒体", pattern: /写作|作家|记者|编辑|出版|媒体|编剧|文案|投稿|撰稿/ },
  { key: "service", label: "服务行业", pattern: /服务员|餐饮|外卖|司机|快递|销售|店员|理发|厨师|家政/ },
];

const DOMAIN_LABELS = new Map(STORYLINE_DOMAINS.map((domain) => [domain.key, domain.label] as const));

export function storylineLabel(key: string): string {
  return DOMAIN_LABELS.get(key) ?? key;
}

// 判定一段职业文本命中了哪些主线域（去重、保持声明顺序）。
export function detectStorylineDomains(texts: readonly string[]): string[] {
  const hit: string[] = [];
  for (const text of texts) {
    if (!text) continue;
    for (const domain of STORYLINE_DOMAINS) {
      if (!hit.includes(domain.key) && domain.pattern.test(text)) hit.push(domain.key);
    }
  }
  return hit;
}

// 跨局/局内防重的共享守卫：avoidStorylines 来自最近几局人生主线（本局固定），
// leftStorylines 来自本局已确立且已离开的方向（逐轮动态）。
export interface StorylineGuards {
  avoidStorylines?: string[];
  leftStorylines?: string[];
}

export function parseAvoidStorylines(value: unknown): string[] {
  if (typeof value !== "string" || !value.trim()) return [];
  const valid = new Set(STORYLINE_DOMAINS.map((domain) => domain.key));
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => valid.has(item));
}

// 一局人生里"已成立的职业事实"：只认 occupation 字段，不认事件标题。
// 标题写的是处境，常带他人身份或尚未接受的机会（"老师问你去不去云南调研"
// "父亲让你暑假去工地画图"），拿标题判定主角职业会把规划人生误判成教育、
// 把只去看了一眼车间的人生算成已经入行。父母/邻居/老师的职业也不属于主角。
function occupationFacts(state: LifeState): string[] {
  const facts: string[] = [];
  for (const event of state.history) {
    const occupation = event.objectiveChanges?.occupation;
    if (typeof occupation === "string" && occupation.trim() && !facts.includes(occupation)) facts.push(occupation);
  }
  return facts;
}

// 一局人生的主线域（按出现次数取前 3）：当前职业 + 历史职业事实。
// 用于跨人生防重：最近几局各取主线，新一局开局避开。
// 已退休/已离职的人生仍保留历史职业主线；从没建立职业的童年人生返回空。
export function extractLifeStorylines(state: LifeState): string[] {
  const counts = new Map<string, number>();
  const bump = (domains: string[]) => {
    for (const domain of domains) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  };
  bump(detectStorylineDomains([state.career.occupation]));
  for (const occupation of occupationFacts(state)) bump(detectStorylineDomains([occupation]));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([domain]) => domain);
}

// 本局"已确立且已离开"的主线域（用于单局内防重）。
// 规则：某域在时间轴上出现过职业事实，且其后出现过不同的域（或当前职业已不在该域），
// 则视为"已离开"；该信息只用于避免复演旧处境，不禁止重返。当前职业所在域永不视为已离开。
// 童年埋下的种子（如"进入美术班"）若从未开花成职业、也没有被别的职业接替，不算"已离开"，
// 允许它自然长成职业方向——防止把"童年埋线→成年实现"这种合理走向误杀。
export function leftStorylines(state: LifeState): string[] {
  const entries = occupationFacts(state).map((occupation) => detectStorylineDomains([occupation])).filter((domains) => domains.length > 0);
  const current = detectStorylineDomains([state.career.occupation]);
  const left = new Set<string>();
  for (let i = 0; i < entries.length; i++) {
    for (const domain of entries[i]) {
      const movedAway =
        entries.slice(i + 1).some((later) => later.some((other) => other !== domain)) ||
        current.some((other) => other !== domain);
      if (movedAway) left.add(domain);
    }
  }
  for (const domain of current) left.delete(domain);
  return [...left];
}

// 追加软提醒；动态后缀可能改变缓存公共前缀，不承诺整轮转录缓存命中。
export function buildStorylinePromptHint(guards?: StorylineGuards): string {
  if (!guards) return "";
  const parts: string[] = [];
  if (guards.avoidStorylines && guards.avoidStorylines.length > 0) {
    parts.push(renderPrompt(prompt.crossLife, { domains: guards.avoidStorylines.map(storylineLabel).join("、") }));
  }
  if (guards.leftStorylines && guards.leftStorylines.length > 0) {
    parts.push(renderPrompt(prompt.withinLife, { domains: guards.leftStorylines.map(storylineLabel).join("、") }));
  }
  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}

export function buildRecentSituationHint(state: LifeState): string {
  const recent = state.history.slice(-4).map(event => ({
    eventId: event.id, age: event.age, situation: event.title, action: event.choiceText ?? null,
  }));
  if (!recent.length) return "";
  return renderPrompt(prompt.recentSituation, { recent: JSON.stringify(recent) });
}
