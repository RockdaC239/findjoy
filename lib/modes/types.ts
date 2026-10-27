import type { EventType } from "../life";

export type LifeMode = "normal" | "theme" | "script" | "foru";
export type ThemeId = "love" | "family" | "career";
export type AccessTier = "free" | "premium";

export type EconomyLevel = "tight" | "ordinary" | "comfortable";
export type HealthLevel = "good" | "ordinary" | "fragile";
export type HousingLevel = "with_family" | "rent" | "own" | "unspecified";
export type RelationshipLevel =
  | "single"
  | "dating"
  | "married"
  | "divorced"
  | "widowed"
  | "complicated"
  | "unspecified";

/** ForU 玩家自述。字段全部由服务端校验、截断后持久化。 */
export interface ForuBrief {
  age: number;
  city: string;
  occupation: string;
  family: string;
  relationship: RelationshipLevel;
  economy: EconomyLevel;
  health: HealthLevel;
  housing: HousingLevel;
  situation: string;
  focus: string;
}

export interface NormalScenario {
  mode: "normal";
}

export interface ThemeScenario {
  mode: "theme";
  theme: ThemeId;
}

/** 剧本快照：即使目录后续改版，旧存档仍能按开局时的设定继续。 */
export interface ScriptScenario {
  mode: "script";
  scriptId: string;
  eraId: string;
  eraLabel: string;
  eraYears: string;
  title: string;
  tagline: string;
  premise: string;
  hook: string;
  coreConflict: string;
  tone: string;
  eventType: EventType;
  start: ScriptStart;
  startAge: number;
  directive: string;
}

export interface ForuScenario {
  mode: "foru";
  brief: ForuBrief;
}

export type LifeScenario = NormalScenario | ThemeScenario | ScriptScenario | ForuScenario;

/** 客户端开局请求；服务端会重新解析目录并校验 ForU 文本。 */
export type StartSelection =
  | { mode: "normal" }
  | { mode: "theme"; theme: ThemeId }
  | { mode: "script"; scriptId: string }
  | { mode: "foru"; brief: ForuBrief };

export interface ModeDefinition {
  id: LifeMode;
  label: string;
  eyebrow: string;
  tagline: string;
  description: string;
  access: AccessTier;
  badge?: string;
}

export interface ThemeDefinition {
  id: ThemeId;
  label: string;
  eyebrow: string;
  tagline: string;
  description: string;
  focus: string[];
  eventTypes: EventType[];
}

export interface ScriptEra {
  id: string;
  label: string;
  years: string;
  setting: string;
}

export interface ScriptStart {
  age: number;
  city: string;
  occupation: string;
  education?: string;
  finance?: EconomyLevel;
  cash?: number;
  assets?: number;
  debt?: number;
  incomeYearly?: number;
  partnerStatus?: string;
  physical?: number;
}

export interface ScriptDefinition {
  id: string;
  eraId: string;
  title: string;
  tagline: string;
  premise: string;
  hook: string;
  coreConflict: string;
  tone: string;
  eventType: EventType;
  start: ScriptStart;
  access: AccessTier;
}
