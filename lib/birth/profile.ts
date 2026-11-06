import prompt from "../engine/prompts/birth.json";
import { renderPrompt } from "../engine/prompts/template";
import { sampleBirthLocation, validateBirthLocation, type BirthLocation } from "./locations";
import { BIRTH_OCCUPATIONS, PUBLIC_CAPITAL_LABELS, sampleParentOccupation, type BirthOccupation } from "./occupations";

export interface BirthParent {
  role: "父亲" | "母亲" | "继父" | "继母" | "养父" | "养母";
  birthAge: number;
  education: BirthOccupation["education"];
  occupation: BirthOccupation;
  status: "同住" | "异地" | "缺席";
}
export type BirthGolden = "富二代" | "官二代";
export type BirthSocialCapital = "普通" | "专业" | "体制内";
export type BirthWealthSource = "工资收入" | "个体经营" | "企业经营与资产" | "公共部门" | "混合";
export interface BirthCapital {
  /** 稀有资源型开局；缺省表示普通家庭资本。 */
  golden?: BirthGolden;
  social: BirthSocialCapital;
  wealthSource: BirthWealthSource;
}
export interface BirthProfile {
  version: 1;
  era: "当代中国";
  location: BirthLocation;
  parents: BirthParent[];
  household: {
    housing: string;
    caregiver: string;
    siblings: number[];
    commute: string;
    support: string;
    financialPressure: string;
    resources: string;
  };
  /** 旧存档可缺省；新档案总是写入。 */
  capital?: BirthCapital;
  sampling: "editorial-conditional-v1";
}
export interface BirthOptions {
  economy: string;
  structure: string;
  avoidProvinceCodes?: readonly string[];
  avoidOccupationIds?: readonly string[];
  /** 正式链路先按城市层级抽好地点，再把同一地点交给背景与家庭生成。 */
  location?: BirthLocation;
  /** 仅测试/调试用；正式链路由 rollGolden 根据经济条件抽取。 */
  golden?: BirthGolden;
}
const educationLevels = ["义务教育", "高中或中职", "大专或本科", "研究生"] as const;
const economies = ["拮据", "普通", "小康", "富裕", "大富"];
const structures = ["双亲完整", "单亲", "再婚家庭", "留守隔代", "收养"];
const roles = ["父亲", "母亲", "继父", "继母", "养父", "养母"] as const;
const statuses = ["同住", "异地", "缺席"] as const;
const goldens = ["富二代", "官二代"] as const;
const socialCapitals = ["普通", "专业", "体制内"] as const;
const wealthSources = ["工资收入", "个体经营", "企业经营与资产", "公共部门", "混合"] as const;
// 出生时父母年龄与学历的最低匹配：研究生不可能在 22 岁已有两个孩子。
const MIN_PARENT_AGE: Record<BirthParent["education"], number> = {
  义务教育: 20,
  高中或中职: 22,
  大专或本科: 24,
  研究生: 27,
};
// 兄姐是“主角出生时已经出生的孩子”。三孩家庭在当代城市家庭中应明显偏少，
// 乡村可以更多，但不能把“2个兄姐”当成常见默认。
const SIBLING_COUNT_WEIGHTS: Record<BirthLocation["settlement"], Array<[number, number]>> = {
  城区: [[0, 78], [1, 19], [2, 3]],
  县城: [[0, 65], [1, 29], [2, 6]],
  乡镇: [[0, 55], [1, 36], [2, 9]],
  乡村: [[0, 45], [1, 40], [2, 15]],
};
const pick = <T>(random: () => number, entries: readonly T[]): T => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("出生抽样需要[0,1)随机数");
  return entries[Math.floor(value * entries.length)];
};
function weighted<T>(random: () => number, entries: ReadonlyArray<readonly [T, number]>): T {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("出生抽样需要[0,1)随机数");
  let roll = value * entries.reduce((sum, [, weight]) => sum + weight, 0);
  for (const [item, weight] of entries) {
    roll -= weight;
    if (roll < 0) return item;
  }
  return entries[entries.length - 1][0];
}
function education(random: () => number, economy: string): BirthParent["education"] {
  // 编辑探索权重：资源较多时提高高等教育机会，但保留非学历经营路径。
  const pool = economy === "大富" || economy === "富裕"
    ? [1, 2, 2, 2, 3, 3] : economy === "拮据" ? [0, 0, 1, 1, 2] : [0, 1, 1, 2, 2, 3];
  return educationLevels[pick(random, pool)];
}
function rollGolden(random: () => number, economy: string): BirthGolden | undefined {
  const roll = random();
  if (economy === "大富") {
    if (roll < 0.3) return "富二代";
    if (roll < 0.34) return "官二代";
    return undefined;
  }
  // 官二代只出现在有基本家庭资源的经济层；拮据/普通不抽，避免“极好开局”落在
  // 与资源不匹配的家庭。极好开局合计约5.7%，50轮通常只出现1～3次。
  if ((economy === "小康" || economy === "富裕") && roll < 0.10) return "官二代";
  return undefined;
}
function capitalFor(golden: BirthGolden | undefined, economy: string): BirthCapital {
  const social: BirthSocialCapital = golden === "官二代"
    ? "体制内"
    : economy === "富裕" || economy === "大富" ? "专业" : "普通";
  const wealthSource: BirthWealthSource = golden === "富二代"
    ? "企业经营与资产"
    : golden === "官二代"
      ? economy === "富裕" || economy === "大富" ? "混合" : "公共部门"
      : economy === "大富" ? "企业经营与资产"
        : economy === "富裕" ? "混合"
          : "工资收入";
  return { ...(golden ? { golden } : {}), social, wealthSource };
}
function goldenResources(golden: BirthGolden | undefined, economy: string): string | undefined {
  if (golden === "富二代") return "家庭经营或长期持有资产是主要资源，父母当前岗位收入不是全部；资源带来选择，也带来家庭期待。";
  if (golden === "官二代") return economy === "富裕" || economy === "大富"
    ? "家庭既有经营或资产积累，也有公共部门的长期社会关系；资源带来选择，也带来约束和家庭期待。"
    : "家庭在公共部门有稳定收入和长期社会关系；不承诺特权，也不能自动解决主角的人生问题。";
  return undefined;
}
function parent(random: () => number, role: BirthParent["role"], status: BirthParent["status"], location: BirthLocation, options: BirthOptions, avoidIds: readonly string[], special?: "business" | "public"): BirthParent {
  const degree = special === "public"
    ? pick(random, ["大专或本科", "研究生"] as const)
    : education(random, options.economy);
  let occupation = sampleParentOccupation(random, {
    settlement: location.settlement,
    education: degree,
    avoidIds,
    ...(special === "business" ? { employment: "个体经营" as const, minIncomeBand: 3 } : {}),
    ...(special === "public" ? { sectorLabel: "公共服务", labels: PUBLIC_CAPITAL_LABELS, minIncomeBand: 3 } : {}),
  });
  if (!special && (options.economy === "富裕" || options.economy === "大富") && occupation.incomeBand < 3) {
    const eligible = BIRTH_OCCUPATIONS.filter(item => item.incomeBand >= 3 && educationLevels.indexOf(item.education) <= educationLevels.indexOf(degree));
    const fresh = eligible.filter(item => !avoidIds.includes(item.id));
    if (eligible.length) occupation = pick(random, fresh.length ? fresh : eligible);
  }
  const minAge = Math.max(role.startsWith("养") ? 28 : 20, MIN_PARENT_AGE[degree]);
  const maxAge = role.startsWith("养") ? 45 : 42;
  return { role, status, birthAge: pick(random, Array.from({ length: maxAge - minAge + 1 }, (_, i) => i + minAge)), education: degree, occupation: { ...occupation } };
}

export function rollBirthProfile(random: () => number = Math.random, options: BirthOptions): BirthProfile {
  if (!economies.includes(options.economy) || !structures.includes(options.structure)) throw new RangeError("出生家庭条件无效");
  const location = options.location ?? sampleBirthLocation(random, options.avoidProvinceCodes);
  const golden = options.golden ?? rollGolden(random, options.economy);
  const special = golden === "富二代" ? "business" as const : golden === "官二代" ? "public" as const : undefined;
  const adoptive = options.structure === "收养";
  const migrant = options.structure === "留守隔代";
  // 单亲/再婚先确定缺席的是哪一位亲生父母，确保稀有开局的资源落在同住家长身上。
  const absent = options.structure === "单亲" || options.structure === "再婚家庭" ? pick(random, [0, 1]) : -1;
  const specialIndex = special ? (absent === 0 ? 1 : 0) : -1;
  // 同一家庭内先避开已给另一位父母抽到的职业；只有合格池耗尽时才允许重复。
  const familyAvoid = [...(options.avoidOccupationIds ?? [])];
  const nextParent = (parentRole: BirthParent["role"], status: BirthParent["status"], specialRole?: "business" | "public") => {
    const item = parent(random, parentRole, status, location, options, familyAvoid, specialRole);
    familyAvoid.push(item.occupation.id);
    return item;
  };
  const parents = [
    nextParent(adoptive ? "养父" : "父亲", migrant ? "异地" : "同住", specialIndex === 0 ? special : undefined),
    nextParent(adoptive ? "养母" : "母亲", migrant ? "异地" : "同住", specialIndex === 1 ? special : undefined),
  ];
  if (options.structure === "单亲") parents[absent].status = "缺席";
  if (options.structure === "再婚家庭") {
    parents[absent].status = "缺席";
    parents.push(nextParent(absent === 0 ? "继父" : "继母", "同住"));
  }
  const maxSiblingAge = Math.min(12, ...parents.map(item => item.birthAge - 18));
  const siblingCount = weighted(random, SIBLING_COUNT_WEIGHTS[location.settlement]);
  const siblingAges = Array.from({ length: maxSiblingAge }, (_, i) => i + 1);
  const siblings: number[] = [];
  for (let i = 0; i < siblingCount && siblingAges.length; i++) {
    const age = pick(random, siblingAges);
    siblings.push(age);
    siblingAges.splice(siblingAges.indexOf(age), 1);
  }
  const housing: Record<string, readonly string[]> = {
    拮据: ["面积较小的租住房", "与亲属合住，独立空间有限"],
    普通: ["普通租住房，按月安排房租", "一套普通自住房，仍需安排日常开销"],
    小康: ["空间够用的自住房", "自住房按揭尚在偿还"],
    富裕: ["宽裕的自住房，有独立照护空间", "自住房之外有长期持有的房产"],
    大富: ["宽裕的自住房，另有家庭持有资产", "自住房与经营资产分开管理"],
  };
  const resources: Record<string, string> = {
    拮据: "现有工资或经营收入扣除住房与照护开支后，积蓄较少；不据此编造债务原因",
    普通: "主要依靠当前劳动收入，积蓄有限但可安排日常生活",
    小康: "家庭已有一定积蓄，收入与住房支出相对可安排",
    富裕: "较高劳动或经营收入与家庭既有资产积累共同支持生活",
    大富: "家庭已有较多经营或长期持有资产积累，父母当前岗位收入不是全部家庭资源",
  };
  const financialPressure: Record<string, readonly string[]> = {
    拮据: ["住房与照护开支需要逐月统筹", "收入波动时需先保证基本生活"],
    普通: ["大额开支需要提前储蓄", "日常够用，同时为教育与照护留预算"],
    小康: ["能安排日常支出，仍需规划长期教育与住房成本", "可承担部分额外学习机会，预算并非无限"],
    富裕: ["基本生活开支不紧张，重视长期资源安排", "资产较充足，照护和工作时间仍需协调"],
    大富: ["生活资源充裕，家庭经营与资产安排仍需时间", "物质选择较多，不预设家庭期待或关系好坏"],
  };
  const caregiver = migrant ? "祖辈负责主要日常照护，父母保持联系并按条件返家"
    : adoptive ? "养父母承担稳定养育责任"
      : options.structure === "单亲" ? `${parents.find(item => item.status === "同住")!.role}负责主要照护`
        : options.structure === "再婚家庭" ? "同住的亲生父母一方与继父或继母共同安排照护"
          : pick(random, ["父母轮流安排照护", "父母主要照护，祖辈在需要时协助"]);
  const capital = capitalFor(golden, options.economy);
  return {
    version: 1, era: "当代中国", location, parents,
    household: {
      housing: pick(random, housing[options.economy]), caregiver, siblings: siblings.sort((a, b) => b - a),
      commute: migrant ? "父母工作与家庭居住异地，返家需要协调行程" : parents.some(item => item.status === "同住" && item.occupation.schedule === "轮班") ? "轮班家庭需按班次协调接送与通勤" : pick(random, ["在居住地附近通勤", "乘公共交通或自备交通工具往返工作地", "根据双方工作地点协调接送"]),
      support: pick(random, ["附近有可联系的亲友，帮助需事先商量", "亲友往来不频繁，主要依靠家庭自身安排", "社区公共服务可提供部分日常支持"]),
      financialPressure: pick(random, financialPressure[options.economy]), resources: goldenResources(golden, options.economy) ?? resources[options.economy],
    },
    capital,
    sampling: "editorial-conditional-v1",
  };
}

function record(value: unknown): value is Record<string, unknown> { return Boolean(value) && typeof value === "object" && !Array.isArray(value); }
function text(value: unknown, max = 120): value is string { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value); }
export function validateBirthProfile(value: unknown): BirthProfile | undefined {
  if (!record(value) || value.version !== 1 || value.era !== "当代中国" || value.sampling !== "editorial-conditional-v1") return undefined;
  const location = validateBirthLocation(value.location);
  if (!location || !Array.isArray(value.parents) || value.parents.length < 2 || value.parents.length > 3 || !record(value.household)) return undefined;
  const parents: BirthParent[] = [];
  for (const item of value.parents) {
    if (!record(item) || !roles.includes(item.role as BirthParent["role"]) || !statuses.includes(item.status as BirthParent["status"]) || !Number.isInteger(item.birthAge) || (item.birthAge as number) < 20 || (item.birthAge as number) > 45 || !educationLevels.includes(item.education as BirthParent["education"]) || !record(item.occupation)) return undefined;
    const minimumAge = Math.max(String(item.role).startsWith("养") ? 28 : 20, MIN_PARENT_AGE[item.education as BirthParent["education"]]);
    if ((item.birthAge as number) < minimumAge) return undefined;
    const occupation = BIRTH_OCCUPATIONS.find(role => role.id === (item.occupation as Record<string, unknown>).id);
    if (!occupation || Object.entries(occupation).some(([key, field]) => (item.occupation as Record<string, unknown>)[key] !== field) || educationLevels.indexOf(item.education as BirthParent["education"]) < educationLevels.indexOf(occupation.education)) return undefined;
    if (parents.some(parent => parent.role === item.role)) return undefined;
    parents.push({ role: item.role as BirthParent["role"], birthAge: item.birthAge as number, education: item.education as BirthParent["education"], occupation: { ...occupation }, status: item.status as BirthParent["status"] });
  }
  const roleSet = parents.map(parent => parent.role).sort().join(",");
  const validRoles = [["父亲", "母亲"], ["养父", "养母"], ["父亲", "母亲", "继父"], ["父亲", "母亲", "继母"]].map(items => items.sort().join(","));
  if (!validRoles.includes(roleSet)) return undefined;
  const residentCount = parents.filter(parent => parent.status === "同住").length;
  if (!residentCount && !parents.every(parent => parent.status === "异地")) return undefined;
  if (parents.some(parent => parent.role.startsWith("养")) && residentCount !== 2) return undefined;
  if (parents.length === 3 && (residentCount !== 2 || !parents.some(parent => parent.role.startsWith("继") && parent.status === "同住") || parents.filter(parent => parent.status === "缺席").length !== 1)) return undefined;
  const household = value.household;
  for (const key of ["housing", "caregiver", "commute", "support", "financialPressure", "resources"]) if (!text(household[key])) return undefined;
  if (!Array.isArray(household.siblings) || household.siblings.length > 2 || new Set(household.siblings).size !== household.siblings.length || household.siblings.some(age => !Number.isInteger(age) || age < 0 || age > 12 || parents.some(parent => parent.birthAge < age + 18))) return undefined;
  let capital: BirthCapital | undefined;
  if (value.capital !== undefined) {
    if (!record(value.capital)
      || !socialCapitals.includes(value.capital.social as BirthSocialCapital)
      || !wealthSources.includes(value.capital.wealthSource as BirthWealthSource)) return undefined;
    const golden = value.capital.golden;
    if (golden !== undefined && !goldens.includes(golden as BirthGolden)) return undefined;
    capital = {
      ...(golden !== undefined ? { golden: golden as BirthGolden } : {}),
      social: value.capital.social as BirthSocialCapital,
      wealthSource: value.capital.wealthSource as BirthWealthSource,
    };
  }
  if (capital?.golden === "富二代" && (capital.wealthSource !== "企业经营与资产" || !parents.some(parent => parent.occupation.employment === "个体经营"))) return undefined;
  if (capital?.golden === "官二代" && (capital.social !== "体制内" || !parents.some(parent => (PUBLIC_CAPITAL_LABELS as readonly string[]).includes(parent.occupation.label)))) return undefined;
  return {
    version: 1, era: "当代中国", location, parents,
    household: { housing: household.housing as string, caregiver: household.caregiver as string, siblings: [...household.siblings] as number[], commute: household.commute as string, support: household.support as string, financialPressure: household.financialPressure as string, resources: household.resources as string },
    ...(capital ? { capital } : {}),
    sampling: "editorial-conditional-v1",
  };
}

function modelBirthFacts(profile: BirthProfile) {
  // 年龄是动态事实：system 只给出生时的关系与职业，当前年龄由 user.family_ages
  // 每轮由程序加总。这里不发送 birthAge/兄姐年龄，避免模型自行加减。
  const { siblings, ...household } = profile.household;
  return {
    era: profile.era,
    location: {
      province: profile.location.province,
      city: profile.location.city,
      county: profile.location.county,
      settlement: profile.location.settlement,
    },
    parents: profile.parents.map(parent => ({
      role: parent.role,
      status: parent.status,
      education: parent.education,
      occupation: {
        label: parent.occupation.label,
        sector: parent.occupation.sector,
        employment: parent.occupation.employment,
        schedule: parent.occupation.schedule,
      },
    })),
    household: { ...household, siblingCount: siblings.length },
    ...(profile.capital ? { capital: profile.capital } : {}),
  };
}

const OPENING_SCENES = prompt.OPENING_SCENES;

function openingScene(profile: BirthProfile): string {
  const seed = [profile.location.province, profile.location.city, profile.location.county, ...profile.parents.map(parent => parent.occupation.id)].join("|");
  let hash = 0;
  for (const char of seed) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  return OPENING_SCENES[hash % OPENING_SCENES.length];
}

export function buildBirthDirective(profile: BirthProfile): string {
  return [
    prompt.factsHeading,
    prompt.familyBoundary,
    prompt.ageBoundary,
    prompt.parentFacts,
    prompt.eraBoundary,
    prompt.lifespanBoundary,
    prompt.statusBoundary,
    renderPrompt(prompt.openingScene, { scene: openingScene(profile) }),
    prompt.siblingsBoundary,
    ...(profile.capital?.golden ? [prompt.rareOpening] : []),
    JSON.stringify(modelBirthFacts(profile)),
  ].join("\n");
}
