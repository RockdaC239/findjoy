import type { LifeState, NextEvent } from "../life";
import { parseArgs } from "node:util";
import { buildBirthDirective, validateBirthProfile } from "./profile";

export interface SimulationOptions { live: boolean; count: number; seed: number; output: string }
export interface SimulationManifest { live: boolean; count: number; seed: number; model: string; fingerprint: string }
export interface BirthStartSnapshot {
  basic: LifeState["basic"];
  career: LifeState["career"];
  finance: LifeState["finance"];
  health: LifeState["health"];
  relationships: LifeState["relationships"];
  flags: LifeState["flags"];
  scenario?: LifeState["scenario"];
}
export interface BirthSample {
  index: number; seed: number; status: "dry" | "ok" | "fallback" | "error";
  durationMs: number; retries?: number; initial: unknown; startState?: BirthStartSnapshot;
  event?: NextEvent; error?: string;
}
export function parseSimulationArgs(args: string[]): SimulationOptions {
  const { values } = parseArgs({ args, options: {
    live: { type: "boolean", default: false }, count: { type: "string", default: "50" },
    seed: { type: "string", default: "20261104" }, output: { type: "string", default: ".data/birth-openings-2026-11-04" },
  } });
  const count = Number(values.count), seed = Number(values.seed);
  if (!Number.isSafeInteger(count) || count < 1 || count > 1000) throw new Error("count须为1～1000的整数");
  if (!Number.isSafeInteger(seed)) throw new Error("seed须为安全整数");
  if (!values.output.trim()) throw new Error("output不能为空");
  return { live: values.live, count, seed, output: values.output };
}
export function seededRandom(seed: number): () => number {
  let current = seed >>> 0;
  return () => ((current = (Math.imul(current, 1664525) + 1013904223) >>> 0) / 4294967296);
}
export function compatibleManifest(expected: SimulationManifest, actual: unknown): boolean {
  if (!actual || typeof actual !== "object") return false;
  return Object.entries(expected).every(([key, value]) => (actual as Record<string, unknown>)[key] === value);
}
function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}
function text(value: unknown, fallback = "未提供"): string {
  if (typeof value === "string" && value.trim()) return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}
function countValues(values: unknown[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const value of values) { const key = String(value ?? "未提供"); counts[key] = (counts[key] ?? 0) + 1; }
  return counts;
}
function parentRows(profile: Record<string, unknown>): Record<string, unknown>[] {
  return Array.isArray(profile.parents) ? profile.parents.map(record) : [];
}
function siblingCount(profile: Record<string, unknown>): number {
  const siblings = record(profile.household).siblings;
  return Array.isArray(siblings) ? siblings.length : 0;
}
function consistencyWarnings(samples: BirthSample[], profiles: Record<string, unknown>[], valid: ReturnType<typeof validateBirthProfile>[]) {
  const warnings: Array<{ index: number; message: string }> = [];
  samples.forEach((sample, position) => {
    const profile = profiles[position];
    const location = record(profile.location);
    const parents = parentRows(profile);
    const occupationIds = parents.map(parent => record(parent.occupation).id).filter(value => typeof value === "string");
    if (!valid[position]) warnings.push({ index: sample.index, message: "出生档案未通过程序校验" });
    if (occupationIds.length !== new Set(occupationIds).size) warnings.push({ index: sample.index, message: "同一家庭父母职业重复" });
    if (siblingCount(profile) > 2) warnings.push({ index: sample.index, message: "兄姐数量超过2" });
    if (!sample.startState) {
      warnings.push({ index: sample.index, message: "缺少调用前开局状态快照" });
      return;
    }
    const basic = record(sample.startState.basic);
    const city = text(basic.city, "");
    if (location.city && city && !city.includes(String(location.city))) warnings.push({ index: sample.index, message: "开局城市与出生地市不一致" });
    if (location.county && city && !city.includes(String(location.county))) warnings.push({ index: sample.index, message: "开局城市与出生县区不一致" });
  });
  return warnings;
}
export function summarizeBirthSamples(samples: BirthSample[]) {
  const profiles = samples.map(sample => record(sample.initial));
  const valid = profiles.map(profile => validateBirthProfile(profile));
  const locations = profiles.map(profile => record(profile.location));
  const backgrounds = profiles.map(profile => record(profile.background));
  const parents = profiles.flatMap(parentRows);
  const usages = samples.flatMap(sample => sample.event?.usage ? [sample.event.usage] : []);
  const promptTokens = usages.reduce((sum, usage) => sum + usage.promptTokens, 0);
  const outputTokens = usages.reduce((sum, usage) => sum + usage.completionTokens, 0);
  const knownCache = usages.filter(usage => (usage.promptCacheHitTokens ?? 0) + (usage.promptCacheMissTokens ?? 0) === usage.promptTokens);
  const hitTokens = knownCache.reduce((sum, usage) => sum + (usage.promptCacheHitTokens ?? 0), 0);
  const missTokens = knownCache.reduce((sum, usage) => sum + (usage.promptCacheMissTokens ?? 0), 0);
  const unknownCacheTokens = promptTokens - hitTokens - missTokens;
  const repeatedTitles = Object.entries(countValues(samples.filter(sample => sample.event).map(sample => sample.event!.event.title))).filter(([, n]) => n > 1);
  const openingSignals = Object.entries(countValues(samples.filter(sample => sample.event).map(sample => sample.event!.story.replace(/^你[零〇一二两三四五六七八九十百\d]+岁[，,、。]?/u, "").slice(0, 10)))).filter(([, n]) => n > 1);
  const duplicateOccupations = samples.flatMap((sample, index) => {
    const ids = parentRows(profiles[index]).map(parent => record(parent.occupation).id).filter(value => typeof value === "string");
    return ids.length === new Set(ids).size ? [] : [{ index: sample.index, occupations: ids }];
  });
  const modelWarnings = samples.flatMap(sample => {
    const event = sample.event;
    if (!event) return [];
    const result: string[] = [];
    if (event.timePassed < 1 || event.timePassed >= 15) result.push("落地年龄不在童年范围");
    if (event.choices.length) result.push("童年输出了选项");
    if (event.outcome === "death") result.push("童年终点需人工核对合理性");
    if (event.objectiveChanges.city && event.objectiveChanges.city !== record(record(sample.initial).location).city) result.push("开局城市变更需人工核对迁居依据");
    return result.map(message => ({ index: sample.index, message }));
  });
  const warnings = [...consistencyWarnings(samples, profiles, valid), ...modelWarnings];
  const parentAges = parents.map(parent => parent.birthAge).filter((age): age is number => typeof age === "number");
  return {
    total: samples.length, dry: samples.filter(sample => sample.status === "dry").length,
    ok: samples.filter(sample => sample.status === "ok").length, fallback: samples.filter(sample => sample.status === "fallback").length,
    error: samples.filter(sample => sample.status === "error").length, retries: samples.reduce((sum, sample) => sum + (sample.retries ?? 0), 0),
    validProfiles: valid.filter(Boolean).length, missingStartStates: samples.filter(sample => !sample.startState).length,
    unknownUsageSamples: samples.filter(sample => !sample.event?.usage).length,
    durationMs: samples.reduce((sum, sample) => sum + sample.durationMs, 0),
    provinces: countValues(locations.map(location => location.province)), settlements: countValues(locations.map(location => location.settlement)),
    economies: countValues(backgrounds.map(background => background.economy)),
    structures: countValues(backgrounds.map(background => background.structure)),
    eventGenres: countValues(backgrounds.map(background => background.event)),
    parentRoles: countValues(parents.map(parent => parent.role)),
    parentStatuses: countValues(parents.map(parent => parent.status)),
    parentEducations: countValues(parents.map(parent => parent.education)),
    parentIncomeBands: countValues(parents.map(parent => record(parent.occupation).incomeBand)),
    parentAgeRange: parentAges.length ? { min: Math.min(...parentAges), max: Math.max(...parentAges) } : null,
    siblingCounts: countValues(profiles.map(profile => String(siblingCount(profile)))),
    occupations: countValues(parents.map(parent => record(parent.occupation).label)), sectors: countValues(parents.map(parent => record(parent.occupation).sector)),
    caregivers: countValues(profiles.map(profile => record(profile.household).caregiver)),
    housing: countValues(profiles.map(profile => record(profile.household).housing)),
    duplicateOccupations,
    promptTokens, outputTokens, hitTokens, missTokens, unknownCacheTokens,
    estimatedCny: {
      low: (hitTokens * 0.02 + missTokens + unknownCacheTokens * 0.02 + outputTokens * 4) / 1e6,
      high: (hitTokens * 0.04 + missTokens * 2 + unknownCacheTokens * 2 + outputTokens * 8) / 1e6,
      note: "按Flash空闲/高峰单价估算上下界，缓存未知输入按全部命中/未命中界定；无usage的尝试未计，非账单、非美元。",
    },
    repeatedTitles, openingSignals, warnings,
  };
}
function locationLine(location: Record<string, unknown>): string {
  const parts = [...new Set([location.province, location.city, location.county].filter(value => typeof value === "string" && value.trim()))];
  return `${parts.length ? parts.join(" / ") : "未提供"}${location.settlement ? ` · ${location.settlement}` : ""}`;
}
function parentsTable(parents: Record<string, unknown>[]): string {
  if (!parents.length) return "未提供父母资料。";
  return [
    "| 角色 | 状态 | 出生时年龄 | 学历 | 职业 | 行业 | 就业 | 班次 |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
    ...parents.map(parent => {
      const occupation = record(parent.occupation);
      return `| ${text(parent.role)} | ${text(parent.status)} | ${text(parent.birthAge)} | ${text(parent.education)} | ${text(occupation.label)} | ${text(occupation.sector)} | ${text(occupation.employment)} | ${text(occupation.schedule)} |`;
    }),
  ].join("\n");
}
function householdLines(household: Record<string, unknown>): string {
  const siblings = Array.isArray(household.siblings) ? household.siblings.join("、") : "无";
  return [
    `- 住房：${text(household.housing)}`,
    `- 主要照护：${text(household.caregiver)}`,
    `- 兄姐年龄：${siblings || "无"}`,
    `- 通勤安排：${text(household.commute)}`,
    `- 亲友支持：${text(household.support)}`,
    `- 开支压力：${text(household.financialPressure)}`,
    `- 家庭资源：${text(household.resources)}`,
  ].join("\n");
}
function startStateLines(startState: BirthStartSnapshot | undefined): string {
  if (!startState) return "缺少调用前开局状态快照。";
  const basic = startState.basic;
  return [
    "| 字段 | 程序写入值 |",
    "| --- | --- |",
    `| 年龄 | ${basic.age} |`,
    `| 城市 | ${text(basic.city)} |`,
    `| 教育 | ${text(basic.education)} |`,
    `| 职业 | ${text(startState.career.occupation)} |`,
    `| 现金 / 资产 / 债务 | ${startState.finance.cash} / ${startState.finance.assets} / ${startState.finance.debt} |`,
    `| 住房 | ${text(startState.finance.housing)} |`,
    `| 父母关系 | ${text(startState.relationships.parents.status)} |`,
    `| flags | \`${JSON.stringify(startState.flags)}\` |`,
  ].join("\n");
}
function modelResult(sample: BirthSample): string {
  if (sample.status === "dry") return "未调用模型（dry run）。以上是调用前由程序生成的设定，本报告不含模型正文。";
  if (!sample.event) return sample.error ?? "未调用模型，仅合成采样";
  return `标题：${sample.event.event.title}

落地年龄：${sample.event.timePassed}岁

${sample.event.story}

规范化事件（含客观变更、usage与兜底原因）：

\`\`\`json
${JSON.stringify(sample.event, null, 2)}
\`\`\``;
}
export function renderBirthReport(samples: BirthSample[], manifest: SimulationManifest): string {
  const summary = summarizeBirthSamples(samples);
  const mode = manifest.live ? "真实LLM" : "只采样（未调用模型）";
  const head = `# 出生开局验证报告

模型：${manifest.model}；模式：${mode}；种子：${manifest.seed}；目标：${manifest.count}；已记录：${samples.length}。
源指纹：${manifest.fingerprint}

这是编辑条件采样，不是人口统计分布；50个开局不证明长期剧情差异。标题/前10字相似仅为启发式信号；出生亲属、地点与正文一致性须人工逐条审核，未输出假精确的语义评分。失败不替换为新成功样本。
人民币上下界据docs/development/deepseek-model-pricing.md，非Flash模型不可套用；缺失usage可能低估，dryrun不表示实际消费。
${manifest.live ? "" : "\n本轮为 dry run：以下逐条展示模型请求前程序生成的出生地点、父母、家庭条件、开局状态与发给模型的出生设定。"}

## 汇总

\`\`\`json
${JSON.stringify(summary, null, 2)}
\`\`\`

## 逐条样例
`;
  const body = samples.map(sample => {
    const profile = record(sample.initial);
    const location = record(profile.location);
    const household = record(profile.household);
    const background = record(profile.background);
    const valid = validateBirthProfile(sample.initial);
    return `
## ${String(sample.index).padStart(3, "0")} · ${sample.status}

种子：${sample.seed}；耗时：${sample.durationMs}ms；重试：${sample.retries ?? 0}。

### 出生地点

- 行政区：${locationLine(location)}
- 开局城市字段：${text(record(sample.startState?.basic).city)}

### 父母（主角出生时）

${parentsTable(parentRows(profile))}

### 家庭条件

${householdLines(household)}

### 本局底色（仅作开局基调）

- 家庭经济：${text(background.economy)}
- 家庭结构：${text(background.structure)}
- 开局事件基调：${text(background.event)}

### 程序写入的开局状态

${startStateLines(sample.startState)}

### 交给模型的出生设定

\`\`\`text
${valid ? buildBirthDirective(valid) : "出生档案未通过程序校验，正式链路会拒绝生成。"}
\`\`\`

### 原始出生与背景快照

\`\`\`json
${JSON.stringify(sample.initial, null, 2)}
\`\`\`

### 模型结果

${modelResult(sample)}
`;
  }).join("");
  return head + body;
}
