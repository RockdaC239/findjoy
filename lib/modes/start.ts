import { rollBirthProfile, type BirthProfile } from "../birth/profile";
import { sampleBirthLocation } from "../birth/locations";
import { rollLifespan } from "../lifespan";
import {
  backgroundToFinance,
  backgroundToFlags,
  rollBackground,
  type BackgroundAvoid,
  type LifeBackground,
} from "../background";
import { createStarterLife, type Gender, type LifeState } from "../life";
import { getScript, getTheme, isThemeId } from "./catalog";
import { NORMAL_SCENARIO, scriptToScenario, validateForuBrief } from "./scenario";
import type {
  EconomyLevel,
  ForuBrief,
  HealthLevel,
  HousingLevel,
  LifeScenario,
  ScriptStart,
  StartSelection,
} from "./types";

const GENDERS: Gender[] = ["female", "male", "nonbinary", "unspecified"];

type StartRequest = Record<string, unknown>;

export type ParsedStartRequest =
  | { ok: true; gender: Gender; selection: StartSelection }
  | { ok: false; error: string };

function isRecord(value: unknown): value is StartRequest {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isGender(value: unknown): value is Gender {
  return typeof value === "string" && (GENDERS as string[]).includes(value);
}

export function parseStartLifeRequest(input: unknown): ParsedStartRequest {
  if (!isRecord(input)) return { ok: false, error: "开局参数格式不正确。" };
  const gender = input.gender === undefined ? "unspecified" : input.gender;
  if (!isGender(gender)) return { ok: false, error: "性别参数不正确。" };

  const mode = input.mode ?? "normal";
  if (mode === "normal") return { ok: true, gender, selection: { mode: "normal" } };

  if (mode === "theme") {
    if (!isThemeId(input.theme)) return { ok: false, error: "请选择一个有效的主题。" };
    return { ok: true, gender, selection: { mode: "theme", theme: input.theme } };
  }

  if (mode === "script") {
    if (typeof input.scriptId !== "string" || !getScript(input.scriptId)) {
      return { ok: false, error: "这个剧本不存在或已经下线。" };
    }
    return { ok: true, gender, selection: { mode: "script", scriptId: input.scriptId } };
  }

  if (mode === "foru") {
    const validated = validateForuBrief(input.brief);
    if (!validated.ok) return { ok: false, error: validated.error };
    return { ok: true, gender, selection: { mode: "foru", brief: validated.brief } };
  }

  return { ok: false, error: "未知的玩法模式。" };
}

export interface StartPlan {
  birth?: BirthProfile;
  /** 普通/主题的个体寿命上限；剧本/ForU 不设。 */
  lifespan?: number;
  scenario: LifeScenario;
  startAge: number;
  openingAtCurrentAge: boolean;
  background?: LifeBackground;
}

export interface StartPreview {
  scenario: LifeScenario;
  age: number;
  city?: string;
}

/** 客户端开局请求发出后、模型返回前，用本地目录立即显示正确的模式与年龄。 */
export function previewStart(selection: StartSelection): StartPreview {
  if (selection.mode === "normal") return { scenario: NORMAL_SCENARIO, age: 0 };
  if (selection.mode === "theme") return { scenario: { mode: "theme", theme: selection.theme }, age: 0 };
  if (selection.mode === "script") {
    const script = getScript(selection.scriptId);
    if (script) {
      return {
        scenario: scriptToScenario(script),
        age: script.start.age,
        city: script.start.city,
      };
    }
    return { scenario: NORMAL_SCENARIO, age: 0 };
  }
  return {
    scenario: { mode: "foru", brief: selection.brief },
    age: selection.brief.age,
    city: selection.brief.city || undefined,
  };
}

export interface StartPlanOptions {
  backgroundAvoid?: BackgroundAvoid;
  random?: () => number;
}

export function resolveStartPlan(selection: StartSelection, options: StartPlanOptions = {}): StartPlan {
  if (selection.mode === "normal" || selection.mode === "theme") {
    if (selection.mode === "theme" && !getTheme(selection.theme)) {
      throw new Error(`Unknown theme: ${selection.theme}`);
    }
    // 先按城市层级抽地点，再让经济与家庭条件共用同一地点；
    // 避免“乡村富裕/城区普通”完全由两套独立随机数碰撞出来。
    const random = options.random ?? Math.random;
    const location = sampleBirthLocation(random, options.backgroundAvoid?.provinceCodes);
    // 出生地点、照护与通勤由 BirthProfile 生成，不再叠加可能与出生地矛盾的
    // 旧“生活机会环境”。旧存档仍通过 flagsToBackground 兼容读取。
    const background = rollBackground(random, options.backgroundAvoid, { includeOpportunity: false, settlement: location.settlement });
    const birth = rollBirthProfile(random, {
      economy: background.economy, structure: background.structure,
      location,
      avoidOccupationIds: options.backgroundAvoid?.occupationIds,
    });
    return {
      birth,
      lifespan: rollLifespan(random),
      scenario:
        selection.mode === "theme"
          ? { mode: "theme", theme: selection.theme }
          : NORMAL_SCENARIO,
      startAge: 0,
      openingAtCurrentAge: false,
      background,
    };
  }

  if (selection.mode === "script") {
    const script = getScript(selection.scriptId);
    if (!script) throw new Error(`Unknown script: ${selection.scriptId}`);
    const scenario = scriptToScenario(script);
    return { scenario, startAge: scenario.startAge, openingAtCurrentAge: true };
  }

  return {
    scenario: { mode: "foru", brief: selection.brief },
    startAge: selection.brief.age,
    openingAtCurrentAge: true,
  };
}

const ECONOMY_FINANCE: Record<EconomyLevel, { cash: number; assets: number; debt: number; incomeYearly: number }> = {
  tight: { cash: 2000, assets: 2000, debt: 0, incomeYearly: 30000 },
  ordinary: { cash: 8000, assets: 8000, debt: 0, incomeYearly: 90000 },
  comfortable: { cash: 150000, assets: 400000, debt: 0, incomeYearly: 250000 },
};

const SCRIPT_FINANCE: Record<EconomyLevel, { cash: number; assets: number; debt: number }> = {
  tight: { cash: 300, assets: 500, debt: 0 },
  ordinary: { cash: 800, assets: 1500, debt: 0 },
  comfortable: { cash: 5000, assets: 10000, debt: 0 },
};

const HEALTH_PHYSICAL: Record<HealthLevel, number> = {
  good: 88,
  ordinary: 70,
  fragile: 45,
};

const RELATIONSHIP_LABEL: Record<ForuBrief["relationship"], string> = {
  single: "单身",
  dating: "恋爱中",
  married: "已婚",
  divorced: "离异",
  widowed: "丧偶",
  complicated: "关系复杂",
  unspecified: "未填写",
};

const HOUSING_LABEL: Record<HousingLevel, string> = {
  with_family: "与家人同住",
  rent: "租住",
  own: "自有住房",
  unspecified: "未填写",
};

function scriptFinance(seed: ScriptStart): { cash: number; assets: number; debt: number } {
  const base = seed.finance ? SCRIPT_FINANCE[seed.finance] : { cash: 800, assets: 1500, debt: 0 };
  return {
    cash: seed.cash ?? base.cash,
    assets: seed.assets ?? base.assets,
    debt: seed.debt ?? base.debt,
  };
}

function scriptHousing(seed: ScriptStart): string {
  if (seed.age < 22) return "与家人同住";
  if (seed.finance === "tight") return "租住";
  return seed.age >= 30 ? "租住" : "与家人同住";
}

function adultCareerStage(age: number): string {
  return age < 15 ? "childhood" : "career";
}

export interface CreateStartOptions {
  recentStorylines?: string[];
}

/**
 * 把开局计划落成 LifeState。
 * - 普通/主题：沿用随机出身档案与跨局防重；
 * - 剧本：使用剧本作者的起始城市/职业/财务；
 * - ForU：使用玩家自述，缺省字段才回退。
 */
export function createStartLife(plan: StartPlan, gender: Gender, options: CreateStartOptions = {}): LifeState {
  const scenario = plan.scenario;

  if (scenario.mode === "normal" || scenario.mode === "theme") {
    if (!plan.background) throw new Error("Normal/theme start requires a background");
    const birth = plan.birth;
    const city = birth ? [...new Set([birth.location.province, birth.location.city, birth.location.county])].join("·") : undefined;
    const starter = createStarterLife({ age: 0, gender, city });
    const flags = backgroundToFlags(plan.background);
    if (scenario.mode === "normal" && options.recentStorylines?.length) {
      flags.avoidStorylines = options.recentStorylines.join(",");
    }
    return {
      ...starter,
      experienceVersion: 3,
      ...(plan.lifespan ? { lifespan: plan.lifespan } : {}),
      ...(birth ? { birth, relationships: { ...starter.relationships, parents: {
        status: birth.parents.map(parent => `${parent.role}：${parent.status}`).join("；"),
      } } } : {}),
      finance: { ...starter.finance, ...backgroundToFinance(plan.background), ...(birth ? { housing: birth.household.housing } : {}) },
      flags,
      scenario,
    };
  }

  if (scenario.mode === "script") {
    const seed = scenario.start;
    const starter = createStarterLife({
      age: seed.age,
      gender,
      city: seed.city,
      education: seed.education ?? "已成年",
    });
    const finance = scriptFinance(seed);
    return {
      ...starter,
      experienceVersion: 3,
      career: {
        ...starter.career,
        occupation: seed.occupation,
        companyType: "未填写",
        incomeYearly: seed.incomeYearly ?? 0,
        careerStage: adultCareerStage(seed.age),
      },
      finance: { ...starter.finance, ...finance, housing: scriptHousing(seed) },
      health: { ...starter.health, physical: seed.physical ?? 88 },
      relationships: {
        ...starter.relationships,
        partner: { status: seed.partnerStatus ?? "单身", years: 0 },
      },
      scenario,
    };
  }

  const brief = scenario.brief;
  const starter = createStarterLife({
    age: brief.age,
    gender,
    city: brief.city || undefined,
    education: "已成年",
  });
  const finance = ECONOMY_FINANCE[brief.economy];
  return {
    ...starter,
      experienceVersion: 3,
    career: {
      ...starter.career,
      occupation: brief.occupation || "未填写",
      companyType: "未填写",
      incomeYearly: finance.incomeYearly,
      careerStage: adultCareerStage(brief.age),
    },
    finance: {
      ...starter.finance,
      cash: finance.cash,
      assets: finance.assets,
      debt: finance.debt,
      housing: HOUSING_LABEL[brief.housing],
    },
    health: { ...starter.health, physical: HEALTH_PHYSICAL[brief.health] },
    relationships: {
      ...starter.relationships,
      partner: { status: RELATIONSHIP_LABEL[brief.relationship], years: 0 },
    },
    scenario,
  };
}

export function startSelectionLabel(selection: StartSelection): string {
  if (selection.mode === "theme") return getTheme(selection.theme)?.label ?? "主题";
  if (selection.mode === "script") return getScript(selection.scriptId)?.title ?? "剧本";
  if (selection.mode === "foru") return "ForU";
  return "普通模式";
}

