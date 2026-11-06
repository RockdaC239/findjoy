import catalog from "../engine/prompts/mode-catalog.json";
import type {
  ModeDefinition,
  ScriptDefinition,
  ScriptEra,
  ThemeDefinition,
  ThemeId,
} from "./types";

export function isLaunchModeAvailable(mode: unknown): boolean {
  return mode === "normal";
}

export const LIFE_MODES: ModeDefinition[] = catalog.LIFE_MODES as ModeDefinition[];

export const THEMES: ThemeDefinition[] = catalog.THEMES as ThemeDefinition[];

export const SCRIPT_ERAS: ScriptEra[] = catalog.SCRIPT_ERAS as ScriptEra[];

export const SCRIPTS: ScriptDefinition[] = catalog.SCRIPTS as ScriptDefinition[];

export function getModeDefinition(id: string): ModeDefinition | undefined {
  return LIFE_MODES.find((mode) => mode.id === id);
}

export function getTheme(id: string): ThemeDefinition | undefined {
  return THEMES.find((theme) => theme.id === id);
}

export function getScript(id: string): ScriptDefinition | undefined {
  return SCRIPTS.find((script) => script.id === id);
}

export function getEra(id: string): ScriptEra | undefined {
  return SCRIPT_ERAS.find((era) => era.id === id);
}

export function scriptsForEra(eraId: string): ScriptDefinition[] {
  return SCRIPTS.filter((script) => script.eraId === eraId);
}

export function isThemeId(value: unknown): value is ThemeId {
  return value === "love" || value === "family" || value === "career";
}
