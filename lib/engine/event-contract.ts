import { normalizeShareLines } from "../share-copy";
import { boundedText, boundedStrings, normalizeNarrative } from "./narrative";
import type { LifeState, LifeChoice, LifeEvent, NextEvent, LifeEnding } from "../life";
import { detectStorylineDomains, storylineLabel, type StorylineGuards } from "../storyline";
// 模型输出在这里转成内部 NextEvent；不要让原始 JSON 直接更新 LifeState。
import { ModelError } from "./errors";

function num(value: unknown) { return typeof value === "number" && Number.isFinite(value) ? value : 0; }

// 只匹配明确的命名句式（名叫/名字叫/名字是/名为/叫作/叫做/姓名），
// 避免把“说出自己的名字”“报名字”这类自我介绍叙述误判为给人物起名，也避免“叫外卖”动词误杀。
function containsNameInstruction(value: string) {
  return /(?:名叫|名字叫|名字是|名为|叫作|叫做|姓名)[：:\s]*[\u4e00-\u9fffA-Za-z]{1,12}/u.test(value);
}

const EVENT_TYPES = ["career", "relationship", "health", "finance", "random", "family"] as const;

// 模型偶尔会用中文或同义词写 event.type（事业/家庭/健康…）。
// 对无歧义的别名做模糊映射，把"类型写错"从"整轮重试"降级为"自动纠正"；
// 完全未知的值仍严格失败，保持硬契约精神。
const EVENT_TYPE_ALIASES: Record<string, (typeof EVENT_TYPES)[number]> = {
  career: "career", 职业: "career", 事业: "career", 工作: "career", 学业: "career", 职场: "career", 求学: "career",
  relationship: "relationship", 关系: "relationship", 情感: "relationship", 爱情: "relationship", 感情: "relationship", 人际: "relationship", 婚恋: "relationship", 社交: "relationship", 友情: "relationship",
  family: "family", 家庭: "family", 家人: "family", 家族: "family", 亲情: "family",
  health: "health", 健康: "health", 身体: "health", 疾病: "health", 医疗: "health", 病痛: "health", 生病: "health",
  finance: "finance", 财务: "finance", 金钱: "finance", 经济: "finance", 财富: "finance", 收入: "finance", 资产: "finance", 债务: "finance",
  random: "random", 随机: "random", 意外: "random", 其他: "random", 其它: "random", 命运: "random", 无常: "random",
};

function normalizeEventType(value: unknown): (typeof EVENT_TYPES)[number] | undefined {
  if (typeof value !== "string") return undefined;
  const key = value.trim().toLowerCase();
  if ((EVENT_TYPES as readonly string[]).includes(key)) return key as (typeof EVENT_TYPES)[number];
  return EVENT_TYPE_ALIASES[key];
}

function normalizeChoiceId(id: string, fallback: string): string {
  const cleaned = id.trim().replace(/^(选项|option)\s*/i, "").toUpperCase();
  return /^[A-Z0-9]{1,3}$/.test(cleaned) ? cleaned : fallback;
}

function normalizeChoices(value: unknown): LifeChoice[] {
  const entries: Array<Record<string, unknown>> = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item === "string" && item.trim()) entries.push({ text: item });
      else if (item && typeof item === "object") entries.push(item as Record<string, unknown>);
    }
  } else if (value && typeof value === "object") {
    // 兼容对象写法 {"A":"选项一","B":"选项二"}
    for (const [id, text] of Object.entries(value as Record<string, unknown>)) entries.push({ id, text });
  }
  // 修复常见的选项格式瑕疵（缺 id / text 用了 option、label / 纯字符串 / 选项A 这类 id），
  // 把"格式小错"从整轮重试降级为自动纠正；真正凑不出 2 个有效选项仍由契约把关。
  const letters = ["A", "B", "C", "D"];
  const used = new Set<string>();
  const choices: LifeChoice[] = [];
  for (const entry of entries) {
    const text = [entry.text, entry.option, entry.label].find((item): item is string => typeof item === "string" && Boolean(item.trim()))?.trim() ?? "";
    if (!text) continue;
    let id = typeof entry.id === "string" && entry.id.trim() ? normalizeChoiceId(entry.id, "") : "";
    if (!id || used.has(id)) {
      id = letters.find((letter) => !used.has(letter)) ?? `X${choices.length + 1}`;
    }
    used.add(id);
    choices.push({ id, text });
    if (choices.length >= 3) break;
  }
  return choices;
}

// 价值张力轴检测：把一组选项归类到它所对抗的价值轴（如“闯荡/留守、理性/感性、服从/反叛…”）。
// 用于“相邻节点不得使用同一条张力轴”的硬契约，阻止模型反复套用“闯出去/留守/折中”同一套模板。
// 返回主导张力轴的 key（如 "闯荡/留守"），检测不出明显对抗时返回 null（不触发该契约）。
interface ValueAxis { key: string; poles: [RegExp, RegExp] }
const VALUE_AXES: ValueAxis[] = [
  { key: "闯荡/留守", poles: [/闯|出去|外地|大城市|打拼|拼一把|赌一把|闯荡|搏|创业|开店|追梦|追|更大的|见世面|闯一闯/, /留守|留在家|本地|照顾家里|顾家|早工作|减轻家里|安稳|稳定|陪在父母|家里|安家|省钱|托付/] },
  { key: "理性/感性", poles: [/理性|理智|分析|利弊|数据|现实|稳妥|靠谱|计算|权衡/, /感性|感觉|直觉|热爱|心动|喜欢|感情|冲动|随性/] },
  { key: "服从/反叛", poles: [/听.{0,3}(父母|家里|老师|家人)|按.{0,4}安排|服从|接受安排|顺着|按部就班/, /反叛|反抗|不听话|坚持自己|自己做主|闹翻|违抗|逆着/] },
  { key: "短利/长利", poles: [/眼前|当下|短期|尽快|快钱|立刻|马上|省事|现成|先赚/, /长远|长期|未来|积累|沉淀|一辈子|打基础|厚积|一劳永逸|走长远/] },
  { key: "向内/向外", poles: [/独处|独自|安静|内敛|自己|一个人的|沉默|低调|向内|躲/, /交朋友|社交|人脉|走出去|认识|结伴|加入|融入|外向|主动接近/] },
  { key: "守成/创新", poles: [/维持|保持现状|守住|不折腾|照旧|现状|稳妥|守成|稳扎稳打/, /创新|突破|转型|尝试新|变革|探索|开辟|开创|试水|扩充/] },
  { key: "独行/合作", poles: [/自己|独自|单干|一个人扛|自己扛/, /合作|合伙|团队|找人|一起|分担|结盟|联手|入股/] },
  { key: "名声/自由", poles: [/名声|名气|认可|荣誉|奖项|头衔|地位|别人眼|出名|影响力/, /自由|自在|随心|不被束缚|不被安排|做自己|无拘/] },
  { key: "合群/独立", poles: [/合群|随大流|跟大家|融入|别人都一样/, /独立|独来独往|不合群|做自己/] },
  { key: "逃避/面对", poles: [/逃避|回避|躲|拖着|放着不管|不去想|算了/, /面对|直面|正视|承担|面对现实|扛|处理/] },
];

// 取历史里最近一个有 choices 的节点（即上一轮给过玩家的决策节点），
// 用于把它的价值张力轴作为本轮“不得重复”的参照。
export function lastChoiceNode(state: Pick<LifeState, "history">): Pick<LifeEvent, "choices"> | undefined {
  for (let i = state.history.length - 1; i >= 0; i--) {
    const node = state.history[i];
    if (node.choices && node.choices.length >= 2) return node;
  }
  return undefined;
}
export function detectValueAxis(choices: LifeChoice[] | undefined): string | null {
  if (!choices || choices.length === 0) return null;
  let best: { key: string; score: number } | null = null;
  for (const axis of VALUE_AXES) {
    let hitsA = 0;
    let hitsB = 0;
    for (const choice of choices) {
      if (axis.poles[0].test(choice.text)) hitsA += 1;
      if (axis.poles[1].test(choice.text)) hitsB += 1;
    }
    if (hitsA > 0 && hitsB > 0) {
      const score = hitsA + hitsB;
      if (!best || score > best.score) best = { key: axis.key, score };
    }
  }
  return best?.key ?? null;
}

function normalizeObjectiveChanges(value: unknown): NextEvent["objectiveChanges"] {
  if (!value || typeof value !== "object") return {};
  const input = value as Record<string, unknown>;
  const pick = <K extends keyof NextEvent["objectiveChanges"]>(key: K) => (typeof input[key] === "number" ? input[key] : typeof input[camelToSnake(key) as K] === "number" ? input[camelToSnake(key) as K] : undefined);
  return {
    incomeYearly: pick("incomeYearly") as number | undefined,
    cash: pick("cash") as number | undefined,
    assets: pick("assets") as number | undefined,
    debt: pick("debt") as number | undefined,
    physical: pick("physical") as number | undefined,
    occupation: typeof input.occupation === "string" ? input.occupation : undefined,
    partnerStatus: typeof input.partnerStatus === "string" ? input.partnerStatus : undefined,
    city: boundedText(input.city, 80),
    education: boundedText(input.education, 80),
    parentsStatus: boundedText(input.parentsStatus, 80),
    fatherStatus: boundedText(input.fatherStatus, 80),
    motherStatus: boundedText(input.motherStatus, 80),
    children: boundedStrings(input.children),
    friends: boundedStrings(input.friends),
    conditions: boundedStrings(input.conditions),
  };
}

function camelToSnake(key: string) {
  return key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

// 容错解析：response_format json_object 保证语法，但个别供应商可能忽略该参数，
// 模型也可能输出 Markdown 围栏、在 JSON 前后夹带文字，或被 max_tokens 截断。
// 依次尝试：原样 → 去围栏 → 截取首个 { 到末尾 }，全部失败才抛错进入重试。
export function parseGeneratedJson(text: string): unknown {
  const trimmed = text.trim();
  const candidates = [trimmed, trimmed.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")];
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last > first) candidates.push(trimmed.slice(first, last + 1));
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object") return parsed;
    } catch { /* try the next candidate */ }
  }
  throw new ModelError("模型返回内容无法解析为 JSON");
}

// 截断修复：max_tokens 或供应商截断导致 JSON 未闭合时，补全未闭合字符串与括号后再解析。
// 消除"输出被截断 → 整轮重试"这一类失败。
export function repairTruncatedJson(text: string): string {
  let s = (text ?? "").trim();
  if (!s) return s;
  const stack: string[] = [];
  let inString = false;
  let escaped = false;
  for (const ch of s) {
    if (inString) {
      if (escaped) { escaped = false; continue; }
      if (ch === "\\") { escaped = true; continue; }
      if (ch === '"') { inString = false; continue; }
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === "{" || ch === "[") { stack.push(ch); continue; }
    if (ch === "}" || ch === "]") {
      const open = stack.pop();
      if ((ch === "}" && open !== "{") || (ch === "]" && open !== "[")) return text; // 结构已乱，放弃修复
    }
  }
  if (inString) s += '"'; // 补全未闭合字符串
  s = s.replace(/[,\s]+$/, ""); // 去掉尾部悬空逗号
  for (let i = stack.length - 1; i >= 0; i--) s += stack[i] === "{" ? "}" : "]"; // 按栈补全闭合
  return s;
}

// 解析失败后先尝试截断修复，仍失败才抛错进入重试。
export function parseWithTruncationRepair(text: string): unknown {
  try {
    return parseGeneratedJson(text);
  } catch {
    return parseGeneratedJson(repairTruncatedJson(text));
  }
}

// 从生成的 JSON 里提取"职业载体"主线域：occupation 变化 + career 事件的标题。
// 只认职业信号，不扫 story/choices——"妈妈住院"的家庭剧情、业余爱好都不会被误判为主线。
function generatedStorylineDomains(candidate: Record<string, unknown>): string[] {
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  const type = event ? normalizeEventType(event.type) : undefined;
  if (!type || !event) return [];
  const changes = (candidate.objectiveChanges && typeof candidate.objectiveChanges === "object"
    ? candidate.objectiveChanges as Record<string, unknown>
    : candidate.objective_changes && typeof candidate.objective_changes === "object"
      ? candidate.objective_changes as Record<string, unknown>
      : {});
  const texts: string[] = [];
  if (typeof changes.occupation === "string" && changes.occupation.trim()) texts.push(changes.occupation);
  if (type === "career" && typeof event.title === "string") texts.push(event.title);
  return detectStorylineDomains(texts);
}

// 诊断哪一道契约关卡失败：返回 null 表示通过，否则返回具体原因。
// expectChoices=false 表示童年阶段，不要求 choices 字段。
// previousChoices=上一个节点的选项，用于“相邻节点张力轴不得相同”的轮换硬约束。
// storylineGuards=题材域层防重守卫（跨人生 avoidStorylines / 单局内 leftStorylines）。
export function diagnoseGeneratedEvent(value: unknown, expectChoices = true, previousChoices?: LifeChoice[] | undefined, storylineGuards?: StorylineGuards): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  if (!event) return "缺少 event 对象";
  if (typeof candidate.story !== "string" || !candidate.story.trim()) return "story 缺失或为空";
  if (typeof event.title !== "string" || !event.title.trim()) return "event.title 缺失或为空";
  if (!normalizeEventType(event.type)) return "event.type 非法：" + String(event.type) + "（应为 career/relationship/health/finance/random/family 之一）";
  if (candidate.outcome === "death") return null;
  if (expectChoices && normalizeChoices(candidate.choices).length < 2) return "choices 少于 2 个有效选项（每项需 id + 非空 text）";
  if (expectChoices) {
    const currentAxis = detectValueAxis(normalizeChoices(candidate.choices));
    const previousAxis = detectValueAxis(previousChoices);
    if (currentAxis && previousAxis && currentAxis === previousAxis) {
      return "价值张力轴与上一节点重复（都是\"" + currentAxis + "\"）。相邻节点必须换一条价值轴：上一节点已是\"" + currentAxis + "\"，本次请改用其它张力轴（如理性/感性、服从/反叛、短利/长利、向内/向外、守成/创新、独行/合作、名声/自由、合群/独立、逃避/面对等），不要再用\"闯出去/留守/折中\"同套模板。";
    }
  }
  // 题材域层防重（第三层硬契约）：跨人生主线与本局已离开方向都不得再进入。
  const generatedStorylines = generatedStorylineDomains(candidate);
  if (storylineGuards?.avoidStorylines && storylineGuards.avoidStorylines.length > 0) {
    const hit = generatedStorylines.find((domain) => storylineGuards!.avoidStorylines!.includes(domain));
    if (hit) return "题材与最近一局人生主线重复（" + storylineLabel(hit) + "）。最近几局已经走过" + storylineGuards.avoidStorylines.map(storylineLabel).join("、") + "，本局不要再进入这些题材，请换一个完全不同的方向。";
  }
  if (storylineGuards?.leftStorylines && storylineGuards.leftStorylines.length > 0) {
    const hit = generatedStorylines.find((domain) => storylineGuards!.leftStorylines!.includes(domain));
    if (hit) return "又回到了本局已经离开的方向（" + storylineLabel(hit) + "）。你在这局人生里已经走过" + storylineGuards.leftStorylines.map(storylineLabel).join("、") + "并已离开，不要再回头进入这些题材；可以继续当前职业，也可以转向全新的方向。";
  }
  const texts = [candidate.story, candidate.memory, event.title, ...normalizeChoices(candidate.choices).map((item) => item.text)]
    .filter((item): item is string => typeof item === "string");
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：任何关键字段缺失、类型非法、含姓名指示词或张力轴重复都返回 null，调用方抛错。
export function normalizeGeneratedEvent(value: unknown, expectChoices = true, previousChoices?: LifeChoice[] | undefined, storylineGuards?: StorylineGuards): NextEvent | null {
  if (diagnoseGeneratedEvent(value, expectChoices, previousChoices, storylineGuards) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event as Record<string, unknown>;
  const story = (candidate.story as string).trim();
  const title = (event.title as string).trim();
  const type = (normalizeEventType(event.type) ?? EVENT_TYPES[0]) as NextEvent["event"]["type"];
  const dying = candidate.outcome === "death";
  const choices = !dying && expectChoices ? normalizeChoices(candidate.choices) : [];
  return {
    outcome: candidate.outcome === "death" ? "death" : "continue",
    deathCause: candidate.outcome === "death" ? normalizeDeathCause(candidate.deathCause) : undefined,
    timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || 1)),
    story,
    event: { type, title, importance: Math.max(0, Math.min(1, num(event?.importance) || 0.6)) },
    choices,
    objectiveChanges: normalizeObjectiveChanges(candidate.objectiveChanges ?? candidate.objective_changes),
    narrative: normalizeNarrative(candidate.narrative),
    memory: typeof candidate.memory === "string" && candidate.memory.trim() ? candidate.memory.trim() : undefined,
  };
}

// 选项补齐池：模型只给出 1 个或 0 个有效选项时，按事件类型补足 2~3 个，
// 保证玩家始终有得选，避免为"选项数量不足"反复重试。
const FILL_CHOICES: Record<string, string[]> = {
  career: ["接受眼前的这个机会", "再观望一段时间，想清楚再动", "按自己的节奏来，不被推着走"],
  relationship: ["认真回应这份心意，把话说明白", "先保持距离，再相处一段时间看看", "坦诚说出自己的顾虑"],
  health: ["立刻去检查，把身体放在第一位", "先调整作息，观察一阵再决定", "咨询专业的人，别自己扛"],
  finance: ["保守一点，先稳住手里的", "留一部分，拿一部分去试试", "找懂行的人问清楚再决定"],
  family: ["把家人叫到一起，把话说开", "先稳住自己，再照顾大家", "按自己的想法来，但和家人说明白"],
  random: ["顺着这个变化往前走", "停下来想想再决定", "把这次变化当成一次机会"],
};

// 修复层：严格契约不过时，把可修复的问题就地解决（不再重试）：
// - choices 不足 2 个 → 自动补齐
// - 价值张力轴重复 → 接受（轮换改为下一轮提示词预防，见 buildSystemPrompt 的 avoidAxis）
// 不可修复的问题（核心字段缺失、含姓名指示词）返回 null，仍走重试。
export function repairGeneratedEvent(value: unknown, expectChoices: boolean, storylineGuards?: StorylineGuards): NextEvent | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const event = candidate.event && typeof candidate.event === "object" ? candidate.event as Record<string, unknown> : null;
  if (!event) return null;
  if (typeof candidate.story !== "string" || !candidate.story.trim()) return null;
  if (typeof event.title !== "string" || !event.title.trim()) return null;
  const type = normalizeEventType(event.type);
  if (!type) return null;
  if (candidate.outcome === "death") return normalizeGeneratedEvent(candidate, false);
  const texts = [candidate.story, candidate.memory, event.title].filter((item): item is string => typeof item === "string");
  if (texts.some(containsNameInstruction)) return null;
  // 题材冲突不可修复（修复层只解决格式问题）：命中跨局防重或单局内防重的主线 → 返回 null 走重试。
  if (storylineGuards && ((storylineGuards.avoidStorylines?.length ?? 0) > 0 || (storylineGuards.leftStorylines?.length ?? 0) > 0)) {
    const hit = generatedStorylineDomains(candidate).find((domain) => (storylineGuards.avoidStorylines?.includes(domain) ?? false) || (storylineGuards.leftStorylines?.includes(domain) ?? false));
    if (hit) return null;
  }
  const choices = normalizeChoices(candidate.choices);
  if (expectChoices) {
    const pool = FILL_CHOICES[type] ?? FILL_CHOICES.random;
    const letters = ["A", "B", "C"].filter((letter) => !choices.some((item) => item.id === letter));
    let poolIndex = 0;
    while (choices.length < 3 && letters.length > 0) {
      choices.push({ id: letters.shift() as string, text: pool[poolIndex % pool.length] });
      poolIndex += 1;
    }
  }
  return {
    outcome: candidate.outcome === "death" ? "death" : "continue",
    deathCause: candidate.outcome === "death" ? normalizeDeathCause(candidate.deathCause) : undefined,
    timePassed: Math.max(1, Math.min(8, num(candidate.timePassed) || num(candidate.time_passed) || 1)),
    story: (candidate.story as string).trim(),
    event: { type, title: (event.title as string).trim(), importance: Math.max(0, Math.min(1, num(event?.importance) || 0.6)) },
    choices: expectChoices ? choices.slice(0, 3) : [],
    objectiveChanges: normalizeObjectiveChanges(candidate.objectiveChanges ?? candidate.objective_changes),
    narrative: normalizeNarrative(candidate.narrative),
    memory: typeof candidate.memory === "string" && candidate.memory.trim() ? candidate.memory.trim() : undefined,
  };
}

// 转录里 assistant 消息的内容：模型产出的规范化事件（去掉 usage 等请求无关字段），字节固定。
export function serializeTranscriptEvent(event: NextEvent): string {
  return JSON.stringify({
    ...(event.outcome ? { outcome: event.outcome } : {}),
    ...(event.deathCause ? { deathCause: event.deathCause } : {}),
    timePassed: event.timePassed,
    story: event.story,
    event: event.event,
    choices: event.choices,
    objectiveChanges: event.objectiveChanges,
    narrative: event.narrative,
    memory: event.memory,
  });
}

// 诊断人生回顾契约失败原因：返回 null 表示通过，否则返回具体原因。
export function diagnoseEnding(value: unknown): string | null {
  if (!value || typeof value !== "object") return "返回内容不是 JSON 对象";
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.age !== "number") return "age 缺失或非数字";
  const facts = candidate.facts && typeof candidate.facts === "object" ? candidate.facts as Record<string, unknown> : null;
  if (!facts) return "缺少 facts 对象";
  if (typeof facts.occupation !== "string" || !facts.occupation.trim()) return "facts.occupation 缺失或为空";
  if (typeof facts.city !== "string" || !facts.city.trim()) return "facts.city 缺失或为空";
  const highlights = Array.isArray(candidate.highlights)
    ? candidate.highlights.filter((item): item is { title: string } => Boolean(item) && typeof item === "object" && typeof (item as { title?: unknown }).title === "string" && Boolean((item as { title: string }).title.trim()))
    : [];
  if (highlights.length < 2) return "highlights 少于 2 个有效人生节点";
  const patterns = Array.isArray(candidate.patterns) ? candidate.patterns.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
  if (patterns.length < 1) return "patterns 缺失或为空";
  if (typeof candidate.death !== "string" || !candidate.death.trim()) return "death 缺失或为空";
  const texts = [...highlights.map((item) => item.title), ...patterns];
  if (texts.some(containsNameInstruction)) return "文本含姓名指示词（名叫/名字叫/叫作…）";
  return null;
}

// 严格契约：关键字段缺失或含姓名指示词返回 null，调用方抛错。
export function normalizeEnding(value: unknown): LifeEnding | null {
  if (diagnoseEnding(value) !== null) return null;
  const candidate = value as Record<string, unknown>;
  const facts = candidate.facts as Record<string, unknown>;
  const highlights = (Array.isArray(candidate.highlights) ? candidate.highlights : []).flatMap((item) => {
    const highlight = item as Record<string, unknown>;
    return [{ age: typeof highlight.age === "number" ? highlight.age : candidate.age as number, title: (highlight.title as string).trim() }];
  }).slice(0, 8);
  const patterns = (Array.isArray(candidate.patterns) ? candidate.patterns : []).filter((item): item is string => typeof item === "string" && Boolean(item.trim())).slice(0, 3);
  return {
    ...(typeof candidate.reflection === "string" && candidate.reflection.trim() && candidate.reflection.length <= 1200 ? { reflection: candidate.reflection.trim() } : {}),
    shareLines: normalizeShareLines(candidate.shareLines),
    evidenceEventIds: Array.isArray(candidate.evidenceEventIds) ? [...new Set(candidate.evidenceEventIds.filter((id): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id)))].slice(0, 4) : [],
    age: candidate.age as number,
    death: (candidate.death as string).trim(),
    facts: { occupation: (facts.occupation as string).trim(), city: (facts.city as string).trim(), events: typeof facts.events === "number" ? facts.events : 0 },
    highlights,
    patterns,
    question: "如果可以再活一次，你会做出不同的选择吗？",
  };
}


export const EVENT_RETRY_GUIDANCE = "字段严格按契约（camelCase，story 在前、event 在后，event.type 只用英文枚举 career/relationship/health/finance/random/family，choices 每项含 id 和非空 text）。";
export const ENDING_RETRY_GUIDANCE = "age 为数字，death 为字符串，facts 含 occupation/city/events，highlights 4-8 条（每项含 age 和 title），patterns 1-3 句，全程不含姓名。";

function normalizeDeathCause(value: unknown): NonNullable<NextEvent["deathCause"]> {
  return value === "natural" || value === "disease" || value === "accident" ? value : "other";
}
