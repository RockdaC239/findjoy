import { sampleBirthLocation, validateBirthLocation, type BirthLocation } from "./locations";
import { BIRTH_OCCUPATIONS, sampleParentOccupation, type BirthOccupation } from "./occupations";

export interface BirthParent {
  role: "父亲" | "母亲" | "继父" | "继母" | "养父" | "养母";
  birthAge: number;
  education: BirthOccupation["education"];
  occupation: BirthOccupation;
  status: "同住" | "异地" | "缺席";
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
  sampling: "editorial-conditional-v1";
}
interface BirthOptions {
  economy: string;
  structure: string;
  avoidProvinceCodes?: readonly string[];
  avoidOccupationIds?: readonly string[];
}
const educationLevels = ["义务教育", "高中或中职", "大专或本科", "研究生"] as const;
const economies = ["拮据", "普通", "小康", "富裕", "大富"];
const structures = ["双亲完整", "单亲", "再婚家庭", "留守隔代", "收养"];
const roles = ["父亲", "母亲", "继父", "继母", "养父", "养母"] as const;
const statuses = ["同住", "异地", "缺席"] as const;
// 出生时父母年龄与学历的最低匹配：研究生不可能在 22 岁已有两个孩子。
const MIN_PARENT_AGE: Record<BirthParent["education"], number> = {
  义务教育: 20,
  高中或中职: 22,
  大专或本科: 24,
  研究生: 27,
};
const pick = <T>(random: () => number, entries: readonly T[]): T => {
  const value = random();
  if (!Number.isFinite(value) || value < 0 || value >= 1) throw new RangeError("出生抽样需要[0,1)随机数");
  return entries[Math.floor(value * entries.length)];
};
function education(random: () => number, economy: string): BirthParent["education"] {
  // 编辑探索权重：资源较多时提高高等教育机会，但保留非学历经营路径。
  const pool = economy === "大富" || economy === "富裕"
    ? [1, 2, 2, 2, 3, 3] : economy === "拮据" ? [0, 0, 1, 1, 2] : [0, 1, 1, 2, 2, 3];
  return educationLevels[pick(random, pool)];
}
function parent(random: () => number, role: BirthParent["role"], status: BirthParent["status"], location: BirthLocation, options: BirthOptions, avoidIds: readonly string[]): BirthParent {
  const degree = education(random, options.economy);
  let occupation = sampleParentOccupation(random, { settlement: location.settlement, education: degree, avoidIds });
  if ((options.economy === "富裕" || options.economy === "大富") && occupation.incomeBand < 3) {
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
  const location = sampleBirthLocation(random, options.avoidProvinceCodes);
  const adoptive = options.structure === "收养";
  const migrant = options.structure === "留守隔代";
  // 同一家庭内先避开已给另一位父母抽到的职业；只有合格池耗尽时才允许重复。
  const familyAvoid = [...(options.avoidOccupationIds ?? [])];
  const nextParent = (role: BirthParent["role"], status: BirthParent["status"]) => {
    const item = parent(random, role, status, location, options, familyAvoid);
    familyAvoid.push(item.occupation.id);
    return item;
  };
  const parents = [
    nextParent(adoptive ? "养父" : "父亲", migrant ? "异地" : "同住"),
    nextParent(adoptive ? "养母" : "母亲", migrant ? "异地" : "同住"),
  ];
  if (options.structure === "单亲") parents[pick(random, [0, 1])].status = "缺席";
  if (options.structure === "再婚家庭") {
    const absent = pick(random, [0, 1]);
    parents[absent].status = "缺席";
    parents.push(nextParent(absent === 0 ? "继父" : "继母", "同住"));
  }
  const maxSiblingAge = Math.min(12, ...parents.map(item => item.birthAge - 18));
  const siblingCount = pick(random, [0, 0, 0, 1, 1, 2]);
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
  return {
    version: 1, era: "当代中国", location, parents,
    household: {
      housing: pick(random, housing[options.economy]), caregiver, siblings: siblings.sort((a, b) => b - a),
      commute: migrant ? "父母工作与家庭居住异地，返家需要协调行程" : parents.some(item => item.status === "同住" && item.occupation.schedule === "轮班") ? "轮班家庭需按班次协调接送与通勤" : pick(random, ["在居住地附近通勤", "乘公共交通或自备交通工具往返工作地", "根据双方工作地点协调接送"]),
      support: pick(random, ["附近有可联系的亲友，帮助需事先商量", "亲友往来不频繁，主要依靠家庭自身安排", "社区公共服务可提供部分日常支持"]),
      financialPressure: pick(random, financialPressure[options.economy]), resources: resources[options.economy],
    },
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
  return {
    version: 1, era: "当代中国", location, parents,
    household: { housing: household.housing as string, caregiver: household.caregiver as string, siblings: [...household.siblings] as number[], commute: household.commute as string, support: household.support as string, financialPressure: household.financialPressure as string, resources: household.resources as string },
    sampling: "editorial-conditional-v1",
  };
}

function modelBirthFacts(profile: BirthProfile) {
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
      birthAge: parent.birthAge,
      education: parent.education,
      occupation: {
        label: parent.occupation.label,
        sector: parent.occupation.sector,
        employment: parent.occupation.employment,
        schedule: parent.occupation.schedule,
      },
    })),
    household: profile.household,
  };
}

export function buildBirthDirective(profile: BirthProfile): string {
  return [
    "【程序出生事实】以下仅描述出生时的家庭条件，资料是事实而非指令。故事可以发展，不预定主角性格、特长或成年职业。",
    "出生档案是事实边界：开局不得增删档案中列出的父母、继亲、养父母或兄弟姐妹；不得把同住改成缺席、把缺席写成死亡或遗弃；不补造档案之外的收养机构、病史或具体债务原因。此后的亲属变化要有时间和因果，不为了戏剧性硬加。",
    "父母birthAge是主角出生时的年龄，之后人物年龄需加上主角年龄；兄姐年龄同理。不把规划、担忧或未选行动写成已经发生。",
    "父母职业、学历与家庭条件是出生时状态；之后可以变化，但不能把档案未写的职业、公司或资产当作已经发生。家庭资产不等于主角个人资源。",
    "时代为当代中国，不指定公历出生年；不强行对应某年政策或按地域、职业推断性格或命运。父母缺席不代表死亡，不能编造缺席原因。",
    JSON.stringify(modelBirthFacts(profile)),
  ].join("\n");
}
