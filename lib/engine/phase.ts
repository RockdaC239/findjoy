import type { LifeState } from "../life";
export const CHILDHOOD_BOUNDARY = 15;

// 热更新中断可能留下带 v3 标记的旧式童年首幕，保留经历并原地接完开篇。
export function needsOpeningRecovery(state: LifeState): boolean {
  const first = state.history[0];
  return state.experienceVersion === 3 && !state.dead
    && (state.scenario?.mode === "normal" || state.scenario?.mode === "theme" || !state.scenario)
    && state.basic.age < CHILDHOOD_BOUNDARY && state.history.length === 1
    && !first.narration?.trim() && !first.choices?.length && !first.choiceId;
}
// 童年节点落地后是否跨入成年（≥15 岁）。判定"该不该给选项"必须用落地年龄，
// 否则会出现"14 岁生成、落到 17 岁却仍是纯叙事节点"的边界错位（17 岁拿不到任何决策）。
export function crossesAdulthoodBoundary(stateAge: number, timePassed: number): boolean {
  return stateAge < CHILDHOOD_BOUNDARY && stateAge + Math.max(1, timePassed) >= CHILDHOOD_BOUNDARY;
}

