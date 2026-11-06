import type { Gender } from "./life";
import type { StartSelection } from "./modes/types";

// 部署在 findfire.club/findjoy 子路径下；客户端 fetch 不会自动带 basePath，需手动加前缀。
export const API_BASE = "/findjoy";

export const ACTIVE_LIFE_KEY = "findjoy:active-life";
export const PENDING_START_KEY = "findjoy:pending-life-start";

export interface PendingStart {
  gender: Gender;
  selection: StartSelection;
  key: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function readPendingStart(): PendingStart | null {
  try {
    const raw = sessionStorage.getItem(PENDING_START_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isRecord(value) || typeof value.key !== "string" || !value.key) return null;
    if (value.gender !== "female" && value.gender !== "male" && value.gender !== "nonbinary" && value.gender !== "unspecified") return null;
    if (!isRecord(value.selection) || typeof value.selection.mode !== "string") return null;
    return value as unknown as PendingStart;
  } catch {
    return null;
  }
}

export function writePendingStart(value: PendingStart): void {
  if (readPendingStart()) return;
  try { sessionStorage.setItem(PENDING_START_KEY, JSON.stringify(value)); } catch { /* storage unavailable */ }
}

export function clearPendingStart(): void {
  try { sessionStorage.removeItem(PENDING_START_KEY); } catch { /* storage unavailable */ }
}

export function discardPendingStartOnError(code?: string): void {
  if (code === "START_FAILED" || code === "IDEMPOTENCY_CONFLICT" || code === "MODE_UNAVAILABLE") clearPendingStart();
}

export function readActiveLifeId(): string | null {
  try {
    const value = localStorage.getItem(ACTIVE_LIFE_KEY);
    return value && value.length <= 128 ? value : null;
  } catch {
    return null;
  }
}

export function rememberActiveLife(lifeId: string): void {
  try { localStorage.setItem(ACTIVE_LIFE_KEY, lifeId); } catch { /* storage unavailable */ }
}

export function forgetActiveLife(): void {
  try { localStorage.removeItem(ACTIVE_LIFE_KEY); } catch { /* storage unavailable */ }
}

const LIFE_SCENE_KEY = "findjoy:life-scene";
export type LifeScene = "decision" | "farewell" | "review";

export function readLifeScene(lifeId: string, eventId: string): LifeScene | null {
  try {
    const value: unknown = JSON.parse(sessionStorage.getItem(LIFE_SCENE_KEY) ?? "null");
    if (!isRecord(value) || value.lifeId !== lifeId || value.eventId !== eventId) return null;
    return value.scene === "decision" || value.scene === "farewell" || value.scene === "review" ? value.scene : null;
  } catch { return null; }
}

export function rememberLifeScene(lifeId: string, eventId: string, scene: LifeScene): void {
  try { sessionStorage.setItem(LIFE_SCENE_KEY, JSON.stringify({ lifeId, eventId, scene })); } catch { /* storage unavailable */ }
}

export function clearLifeScene(): void {
  try { sessionStorage.removeItem(LIFE_SCENE_KEY); } catch { /* storage unavailable */ }
}
