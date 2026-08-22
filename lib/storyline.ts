// 剧本主线识别与防重（第三层防重，题材域层）。
// 出身档案（家庭经济/家庭结构/开局事件）只决定开局底色；人生主线（剧本）由模型事件逐步显现。
// 这里把"剧本主线"定义为可识别的职业/题材域（体育、艺术、创业、医疗、教育、技术…），提供两层保护：
// - 跨人生防重（人生层面）：最近几局的实际主线 → 新一局提示词指令 + 硬契约（不得再走同一题材）
// - 单局内防重（人生内部走向）：本局已确立且已离开的主线 → 硬契约（不得回头重走）
// 与"张力轴轮换"（选项结构层）、"连续性硬约束"（事件内容层）互补，构成第三层：题材域层。
// 只从"职业载体"（career 事件 / occupation 变化 / 当前职业）提取主线，
// 避免把"妈妈住院"这类家庭剧情误判为医疗主线，也避免把业余爱好当成职业方向。
import type { LifeState } from "./life";

export interface StorylineDomain {
  key: string;
  label: string;
  pattern: RegExp;
}

// 模式只匹配"职业/主线级"词，不匹配业余爱好语境（如"踢球""画画"作为消遣不应命中），
// 降低"周末踢个球被当成体育人生"这类误判。个别词汇跨域（如"音乐老师"）会同时命中多个域，
// 契约按"任一命中即拦截"处理，宁严勿松——重试会让模型换方向。
export const STORYLINE_DOMAINS: StorylineDomain[] = [
  { key: "sports", label: "体育竞技", pattern: /体育|运动员|职业球员|体校|省队|国家队|田径|运动队|教练|赛事|球探/ },
  { key: "arts", label: "艺术创作", pattern: /艺术|美术|艺考|音乐学院|美术学院|音乐|钢琴|舞蹈|演艺|演员|歌手|画展|画廊|插画|画家|乐队|作曲/ },
  { key: "startup", label: "创业经商", pattern: /创业|开公司|做生意|开店|融资|合伙人|经商|老板|个体户|创业公司/ },
  { key: "medical", label: "医疗健康", pattern: /医生|护士|从医|行医|医学院|临床|大夫/ },
  { key: "education", label: "教育", pattern: /教师|老师|教书|教职|执教|师范|培训师|班主任|教授/ },
  { key: "tech", label: "技术研发", pattern: /程序员|软件|工程师|研发|互联网|编程|写代码|开发岗|科技公司|产品经理|技术岗/ },
  { key: "finance", label: "财务金融", pattern: /会计|财务|金融|银行|投资|证券|审计|出纳|理财/ },
  { key: "government", label: "体制公职", pattern: /公务员|体制内|机关|国企|事业单位|政府|干部|警察/ },
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

interface CareerMarker {
  title?: string;
  occupation?: string;
}

// 一局人生里的"职业载体"：career 事件（title）与 occupation 变化（objectiveChanges.occupation）。
function careerMarkers(state: LifeState): CareerMarker[] {
  const markers: CareerMarker[] = [];
  for (const event of state.history) {
    if (event.type === "career" || event.objectiveChanges?.occupation) {
      markers.push({ title: event.title, occupation: event.objectiveChanges?.occupation });
    }
  }
  return markers;
}

function markerDomains(marker: CareerMarker): string[] {
  return detectStorylineDomains([marker.title ?? "", marker.occupation ?? ""]);
}

// 一局人生的主线域（按出现次数取前 3）：当前职业 + 全部职业载体。
// 用于跨人生防重：最近几局各取主线，新一局开局避开。
export function extractLifeStorylines(state: LifeState): string[] {
  const counts = new Map<string, number>();
  const bump = (domains: string[]) => {
    for (const domain of domains) counts.set(domain, (counts.get(domain) ?? 0) + 1);
  };
  bump(detectStorylineDomains([state.career.occupation]));
  for (const marker of careerMarkers(state)) bump(markerDomains(marker));
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([domain]) => domain);
}

// 本局"已确立且已离开"的主线域（用于单局内防重）。
// 规则：某域在时间轴上出现过职业载体，且其后出现过不同的域（或当前职业已不在该域），
// 则视为"已离开"；当前职业所在域永不视为已离开（允许职业延续）。
// 童年埋下的种子（如"进入美术班"）若从未开花成职业、也没有被别的职业接替，不算"已离开"，
// 允许它自然长成职业方向——防止把"童年埋线→成年实现"这种合理走向误杀。
export function leftStorylines(state: LifeState): string[] {
  const entries = careerMarkers(state).map(markerDomains).filter((domains) => domains.length > 0);
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

// 追加到系统提示词的防重指令（跨人生固定、单局内逐轮动态，均在提示词尾部，不破坏前缀缓存）。
export function buildStorylinePromptHint(guards?: StorylineGuards): string {
  if (!guards) return "";
  const parts: string[] = [];
  if (guards.avoidStorylines && guards.avoidStorylines.length > 0) {
    parts.push("【跨人生防重】最近几局的人生主线是：" + guards.avoidStorylines.map(storylineLabel).join("、") + "。本局请主动避开这些题材方向，不要让这一局又活成同样的剧本；除此之外的任何方向都可以。");
  }
  if (guards.leftStorylines && guards.leftStorylines.length > 0) {
    parts.push("【单局内防重】这局人生你已经走过" + guards.leftStorylines.map(storylineLabel).join("、") + "这些方向，并且已经离开。不要再回头进入这些题材；可以继续当前职业，也可以转向全新的方向。");
  }
  return parts.length > 0 ? "\n\n" + parts.join("\n\n") : "";
}