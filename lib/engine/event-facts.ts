import type { LifeChoice, LifeState, ObjectiveChanges } from "../life";

export const LIFE_COMMITMENTS = ["relationship", "marriage", "parenthood", "housing", "education", "career"] as const;
export type LifeCommitment = (typeof LIFE_COMMITMENTS)[number];
export function normalizeCommitments(value: unknown): LifeCommitment[] | undefined {
  if (!Array.isArray(value) || value.length > LIFE_COMMITMENTS.length) return undefined;
  const kinds = value.map(item => item && typeof item === "object" && !Array.isArray(item) ? item.type : item);
  return kinds.every(item => LIFE_COMMITMENTS.includes(item)) ? [...new Set(kinds)] : undefined;
}

export interface EventTimeline { resultAge: number | null; sceneAge: number }
export interface EventStateUpdate {
  cashFlow?: { received: number; paid: number };
  debtChange?: { borrowed: number; repaid: number };
  assets?: number;
  physical?: number;
}
const object = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const nonnegative = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER;

// 教育阶段序号。用"层级"而不是关键词白名单判断是否越权：
// 义务教育内部升年级（小学→初中）和同层级毕业（高三→高中毕业、本科→本科毕业）可以自然过渡；
// 跨层级进入高中/中职/专科/本科/研究生/博士，属于玩家必须自己选的去向。
// 旧存档里的"已成年""未填写"等无法识别，返回 undefined，按"未知就跳过"处理。
const EDUCATION_STAGES: Array<{ stage: number; pattern: RegExp }> = [
  { stage: 9, pattern: /博士/ },
  { stage: 8, pattern: /硕士|研究生/ },
  // 高职/专科放在本科之前：否则“高职院校”会先命中“院校”被当成本科。
  { stage: 6, pattern: /专科|大专|高职/ },
  { stage: 7, pattern: /本科|大学|院校|学院/ },
  { stage: 5, pattern: /中职|中专|技校|职高|中技/ },
  { stage: 4, pattern: /高中|普高/ },
  { stage: 3, pattern: /初中/ },
  { stage: 2, pattern: /小学/ },
  { stage: 1, pattern: /幼儿园|学前/ },
  { stage: 0, pattern: /未开始/ },
];
// 需要玩家明确选择的分流层级：中职/技校、专科、本科、硕士、博士。
// 普通高中不算分流：义务教育后读高中是常规延续，把它也拦下来会让模型在
// 15→18 的跨年里反复重试，甚至写出"18 岁初中在读"这种更糟的时间线。
// 只有小学直接跳到高中这类明显失衡才拦。
const EDUCATION_TRACK_STAGE = 5;

export function educationStage(value: string): number | undefined {
  for (const { stage, pattern } of EDUCATION_STAGES) if (pattern.test(value)) return stage;
  return undefined;
}

// 升学是否越权：只拦"跨层级进入分流点"，旧层级无法识别时不猜。
export function unauthorizedEducationChange(from: string, to: string): boolean {
  if (!to || from === to) return false;
  const next = educationStage(to);
  const previous = educationStage(from);
  if (next === undefined || previous === undefined) return false;
  // 0=“未开始”表示还没填过学历，不是“没上过学”：开篇第一次写入当前学历时不能拦，
  // 否则 15 岁的开篇写“高中在读/中职在读”会被连续拒绝，直接卡死第一幕。
  if (previous === 0) return false;
  if (next <= previous) return false;
  if (next === 4) return previous < 3;
  return next >= EDUCATION_TRACK_STAGE;
}

// 仅补全玩家已经明确授权、且客观字段证实已发生的标签；不从故事猜测新授权。
export function completeEventFacts(value: unknown, state: LifeState, choice?: LifeChoice): unknown {
  if (!object(value)) return value;
  const declared = normalizeCommitments(value.lifeChanges);
  const rawChanges = value.objectiveChanges;
  if (!declared || !object(rawChanges)) return value;
  const changes = { ...rawChanges };
  if (object(changes.occupation) && typeof changes.occupation.label === "string") changes.occupation = changes.occupation.label;
  const fields: Record<LifeCommitment, string> = { relationship: "partnerStatus", marriage: "partnerStatus", parenthood: "children", housing: "housing", education: "education", career: "occupation" };
  const actual = (kind: LifeCommitment) => {
    const field = fields[kind];
    if (!(field in changes)) return false;
    if (kind === "education") return changes.education !== state.basic.education;
    if (kind === "career") return changes.occupation !== state.career.occupation;
    if (kind === "housing") return changes.housing !== state.finance.housing;
    if (kind === "parenthood") return Array.isArray(changes.children) && changes.children.some(child => !state.relationships.children.includes(child));
    return changes.partnerStatus !== state.relationships.partner.status;
  };
  const lifeChanges = [...new Set([...declared, ...(choice?.commitments ?? []).filter(actual)])];
  const timeline = object(value.timeline) && value.timeline.resultAge === null && choice && value.timePassed === 0
    ? { ...value.timeline, resultAge: state.basic.age } : value.timeline;
  return {
    ...value,
    ...(value.outcome === "death" && !Object.hasOwn(value, "story") ? { story: "" } : {}),
    ...(value.outcome === "death" && !Object.hasOwn(value, "choices") ? { choices: [] } : {}),
    ...(value.outcome === "death" && !Object.hasOwn(value, "deathCause") ? { deathCause: "other" } : {}),
    objectiveChanges: changes, lifeChanges, timeline,
  };
}

// 新生成的收支与当前值先过边界校验，再转换为旧存档沿用的增量。
export function diagnoseEventFacts(value: unknown, state: LifeState, choice?: LifeChoice | null): string | null {
  if (!object(value) || !object(value.timeline) || !object(value.stateUpdate)) return "缺少 timeline 或 stateUpdate 对象";
  if (value.outcome === "continue" && (!Array.isArray(value.choices) || value.choices.some(choice => !object(choice) || typeof choice.requiresFollowUp !== "boolean"))) return "每个选项必须包含 requiresFollowUp 布尔值";
  const lifeChanges = normalizeCommitments(value.lifeChanges);
  if (!lifeChanges) return "lifeChanges 必须列出本幕已成立的重大承诺，无变化为[]";
  if (value.outcome === "continue" && (value.choices as Record<string, unknown>[]).some(item => !normalizeCommitments(item.commitments))) return "每个选项必须明确 commitments，无重大承诺为[]";
  if (choice === null && lifeChanges.length) return "没有玩家选择时不能新建重大承诺";
  if (choice?.commitments && lifeChanges.some(item => !choice.commitments!.includes(item))) return "本幕lifeChanges超出当前选择的commitments授权：只能先展示已选行动结果，把新的入职/升学/婚恋/生育/住房决定作为下一题；不能仅删lifeChanges却在正文继续代办";
  const timeline = value.timeline, update = value.stateUpdate;
  const landing = state.basic.age + Number(value.timePassed);
  if (!Number.isInteger(timeline.sceneAge) || timeline.sceneAge !== landing) return "timeline.sceneAge 必须等于当前年龄加 timePassed";
  if (timeline.resultAge !== null && (!Number.isInteger(timeline.resultAge) || Number(timeline.resultAge) < state.basic.age || Number(timeline.resultAge) > landing)) return "timeline.resultAge 不在本轮年龄范围内";
  if (choice?.requiresFollowUp && value.outcome !== "death" && value.timePassed !== 0) return "试行选择尚待决定去留，本轮必须同龄呈现结果与跟进决策";
  if (choice && timeline.resultAge === null) return "已选行动必须给出结果发生的年龄";
  if (Object.keys(update).some(key => !["cashFlow", "debtChange", "assets", "physical"].includes(key))) return "stateUpdate 含未知字段，现金与债务必须按收支/借还款记录";
  for (const [key, fields] of [["cashFlow", ["received", "paid"]], ["debtChange", ["borrowed", "repaid"]]] as const) {
    if (!(key in update)) continue;
    const entry = update[key];
    if (!object(entry) || Object.keys(entry).some(field => !fields.includes(field as never)) || fields.some(field => !nonnegative(entry[field]))) return `${key} 必须包含有限非负数 ${fields.join("/")}`;
  }
  if ("assets" in update && !nonnegative(update.assets)) return "assets 必须是有限非负当前值";
  if ("physical" in update && (!nonnegative(update.physical) || update.physical > 100)) return "physical 必须是0～100的当前值";
  const changes = value.objectiveChanges;
  if (!object(changes)) return "objectiveChanges 必须是对象";
  if (["career", "basic", "relationships"].some(key => key in changes)) return "objectiveChanges身份字段必须平铺，不能用嵌套对象绕过承诺校验";
  if ("income_yearly" in changes) return "新协议年收入请使用incomeYearly，不使用income_yearly别名";
  if ("incomeYearly" in changes && !nonnegative(changes.incomeYearly)) return "incomeYearly必须为有限非负年收入当前值";
  if (["cash", "assets", "debt", "physical", "finance", "health"].some(key => key in changes)) return "新协议不能在 objectiveChanges 中混用财务或健康增量，请使用 stateUpdate";
  if (landing >= 15 && state.career.occupation === "婴儿" && value.outcome !== "death" && (typeof changes.occupation !== "string" || !changes.occupation || changes.occupation === "婴儿")) return "决策阶段不能保留婴儿身份，请按事实补学生或待业等身份，不借机安排未授权工作";
  if (typeof changes.education === "string" && unauthorizedEducationChange(state.basic.education, changes.education) && !lifeChanges.includes("education")) {
    return "不能替玩家选学校或升学路径：高中、中职、技校、专科、本科、研究生都需要玩家先选；尚未授权时保留原学历状态，不先入学、不先进车间";
  }
  if (typeof changes.occupation === "string" && changes.occupation && changes.occupation !== state.career.occupation && value.outcome !== "death") {
    const ordinarySchoolProgress = /学生|在读/.test(changes.occupation) && (/婴儿|学生|高中生|初中生|大学生|毕业生/.test(state.career.occupation) || lifeChanges.includes("education"));
    if (!ordinarySchoolProgress && !/待业|无业|失业/.test(changes.occupation) && !lifeChanges.includes("career")) return "职业去向变化超出已选行动：面试/了解不等于接受职位；只写结果，把是否入职或改变去向交回玩家，不能先更新职业和待遇。明确授权后才声明career";
  }
  for (const key of ["children", "friends", "conditions"]) {
    if (key in changes && (!Array.isArray(changes[key]) || changes[key].length > 16 || changes[key].some(item => typeof item !== "string" || !item.trim() || item.length > 80))) return `${key}必须是完整的非空字符串数组快照`;
  }
  if (Array.isArray(changes.children) && changes.children.some(child => !state.relationships.children.includes(String(child))) && !lifeChanges.includes("parenthood")) return "新增子女必须声明parenthood并有玩家明确授权";
  if (typeof changes.partnerStatus === "string" && changes.partnerStatus !== state.relationships.partner.status && !/单身|分手|离异|丧偶|分居|已故/.test(changes.partnerStatus)) {
    const married = (status: string) => /已婚|结婚|婚姻|夫妻|妻子|丈夫/.test(status);
    const partnered = (status: string) => married(status) || /恋爱|伴侣|对象|交往|同居|订婚/.test(status);
    const existing = married(changes.partnerStatus) ? married(state.relationships.partner.status) : partnered(state.relationships.partner.status);
    const kind = married(changes.partnerStatus) ? "marriage" : "relationship";
    if (!existing && !lifeChanges.includes(kind)) return "关系承诺变化必须在lifeChanges声明并得到玩家授权";
  }
  if (typeof changes.housing === "string" && changes.housing !== state.finance.housing && !lifeChanges.includes("housing")) return "住房变化必须在lifeChanges声明并得到玩家授权";
  if ((lifeChanges.includes("marriage") || lifeChanges.includes("relationship")) && typeof changes.partnerStatus !== "string") return "婚恋承诺必须同步partnerStatus，不能只写在正文里";
  if (lifeChanges.includes("parenthood") && !Array.isArray(changes.children)) return "子女变化必须同步children完整快照";
  if (lifeChanges.includes("housing") && typeof changes.housing !== "string") return "住房变化必须同步housing";
  if (lifeChanges.includes("education") && typeof changes.education !== "string") return "教育路径承诺必须同步education";
  if (lifeChanges.includes("career") && typeof changes.occupation !== "string") return "职业承诺必须同步occupation";
  // 仅拦明确第二人称的婚育断言；引号内问话与他人的婚事不是主角事实。
  const narration = typeof value.narration === "string" ? value.narration.replace(/[“「][^”」]*[”」]/g, "") : "";
  const finalParagraph = narration.trim().split(/\n+/).slice(-2).join("\n");
  if (value.outcome === "death" && !/你[^。！？\n]{0,80}(?:离世|去世|死亡|离开了(?:人世|这个世界)|走完了这一生|(?:没(?:有)?再|再也?没(?:有)?)醒(?:过)?来|(?:已经|就此|也|最终)?走了|这一生到此为止|生命(?:就此|在此)?结束|(?:睡下|睡着)[^。！？\n]{0,30}没再起来|(?:呼吸|心跳).{0,12}(?:停止|停了))/.test(finalParagraph)) return "终幕末尾必须明确写主角的生命终点，不能只写亲人离世或留在氛围画面；请完整收束，不新增待决事项";
  const hasMarriage = /已婚|婚姻|夫妻|妻子|丈夫|丧偶|离异|离婚|分居/.test(`${state.relationships.partner.status} ${changes.partnerStatus ?? ""}`);
  if (!hasMarriage && /(?:你们|你)(?:已经|终于|后来|也|就)?(?:领了证|领证了|结了婚|结婚了)(?![吗么？?])|你的(?:妻子|丈夫|老婆|老公)/.test(narration)) return "正文出现主角已婚断言但档案仍未婚；未经婚姻授权不要写领证或配偶，已授权成立则同步partnerStatus";
  const hasChildren = state.relationships.children.length > 0 || (Array.isArray(changes.children) && changes.children.length > 0);
  if (!hasChildren && /(?:你们|你)(?:有了|生了)(?:一个|个|一对)?(?:孩子|儿子|女儿)|你的(?:儿子|女儿)/.test(narration)) return "正文出现主角子女断言但档案无子女；未经生育授权不要代办，已授权成立则同步children";
  const facts = update as unknown as EventStateUpdate;
  const cashBalance = state.finance.cash + (facts.cashFlow?.received ?? 0) - (facts.cashFlow?.paid ?? 0);
  const debtBalance = state.finance.debt + (facts.debtChange?.borrowed ?? 0) - (facts.debtChange?.repaid ?? 0);
  if (cashBalance > Number.MAX_SAFE_INTEGER || debtBalance > Number.MAX_SAFE_INTEGER) return "收支或借还款后的余额超出安全数值范围";
  if (state.finance.cash + (facts.cashFlow?.received ?? 0) - (facts.cashFlow?.paid ?? 0) < 0) return "本幕支出超过现有现金及收入，需交代资金来源";
  if (state.finance.debt + (facts.debtChange?.borrowed ?? 0) - (facts.debtChange?.repaid ?? 0) < 0) return "还款超过现有债务及新增借款";
  if ((facts.debtChange?.borrowed ?? 0) > (facts.cashFlow?.received ?? 0) || (facts.debtChange?.repaid ?? 0) > (facts.cashFlow?.paid ?? 0)) return "借款与还款必须同时计入现金流入与流出";
  return null;
}

export function stateUpdateToChanges(update: EventStateUpdate, state: LifeState): Partial<ObjectiveChanges> {
  return {
    ...(update.cashFlow ? { cash: update.cashFlow.received - update.cashFlow.paid } : {}),
    ...(update.debtChange ? { debt: update.debtChange.borrowed - update.debtChange.repaid } : {}),
    ...(update.assets !== undefined ? { assets: update.assets - state.finance.assets } : {}),
    ...(update.physical !== undefined ? { physical: update.physical - state.health.physical } : {}),
  };
}

export function objectiveChangesForModel(changes: Partial<ObjectiveChanges> | undefined, hasStateUpdate: boolean): Partial<ObjectiveChanges> {
  return hasStateUpdate ? Object.fromEntries(Object.entries(changes ?? {}).filter(([key]) => !["cash", "debt", "assets", "physical"].includes(key))) : changes ?? {};
}
