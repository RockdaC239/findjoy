import { validateBirthProfile } from "./birth/profile";
import { rollLifespan } from "./lifespan";
import type { LifeState } from "./life";
import type { TranscriptMessage } from "./model-adapter";
import { flagsToBackground, type BackgroundAvoid } from "./background";
import { extractLifeStorylines } from "./storyline";
import { validateOpeningPlan, type OpeningPlan } from "./opening-plan";
import { getLifeScenario, getScenarioLabel, getScenarioShortLabel } from "./modes/scenario";
import type { LifeMode } from "./modes/types";
import { query, withTransaction, closePostgres } from "./database";
export interface LifeSummary {
  lifeId: string;
  age: number;
  city: string;
  events: number;
  dead: boolean;
  updatedAt: string;
  mode: LifeMode;
  modeLabel: string;
  modeShort: string;
}

async function recentStates(limit: number, userId?: string): Promise<Array<{state: string}>> {
  return (await query<{state:string}>("SELECT state FROM lives WHERE ($1::text IS NULL OR user_id=$1) ORDER BY updated_at DESC LIMIT $2", [userId ?? null, limit])).rows;
}

export const lifeStore = {
  async get(id: string, userId?: string): Promise<LifeState | null> {
    const row = (await query("SELECT state FROM lives WHERE life_id=$1 AND ($2::text IS NULL OR user_id=$2)", [id,userId ?? null])).rows[0];
    if (!row) return null;
    try {
      const state = JSON.parse(row.state) as LifeState;
      if (state.lifespan === undefined && (state.scenario?.mode === "normal" || state.scenario?.mode === "theme")) {
        // 旧普通/主题存档没有寿命上限：只补一个保守上限，避免把 90～100 岁当成常规。
        state.lifespan = Math.max(state.basic.age + 1, Math.min(90, rollLifespan()));
      }
      // 开局方向只保留目录内的 id；损坏或过期目录的字段直接丢弃，不进入提示词。
      const openingPlan = validateOpeningPlan(state.openingPlan);
      if (openingPlan) state.openingPlan = openingPlan;
      else delete state.openingPlan;
      if (!state.birth) return state;
      // 存档中的出生档案重新过一遍目录校验，防止损坏/伪造的字段直接进入提示词。
      const birth = validateBirthProfile(state.birth);
      return birth ? { ...state, birth } : { ...state, birth: undefined };
    } catch { return null; }
  },
  async set(state: LifeState, userId?: string): Promise<LifeState> {
    const result = await query(`INSERT INTO lives(life_id,state,updated_at,user_id) VALUES ($1,$2,$3,$4)
      ON CONFLICT(life_id) DO UPDATE SET state=excluded.state,updated_at=excluded.updated_at
      WHERE lives.user_id IS NOT DISTINCT FROM excluded.user_id`, [state.lifeId,JSON.stringify(state),new Date().toISOString(),userId ?? null]);
    if (result.rowCount !== 1) throw new Error("人生归属不匹配");
    return state;
  },
  async listSummaries(userId?: string): Promise<LifeSummary[]> {
    const rows = (await query<{life_id:string;state:string;updated_at:string}>("SELECT life_id,state,updated_at FROM lives WHERE ($1::text IS NULL OR user_id=$1) ORDER BY updated_at DESC LIMIT 100", [userId ?? null])).rows;
    return rows.map((row) => {
      let state: LifeState;
      try {
        state = JSON.parse(row.state) as LifeState;
      } catch {
        return { lifeId: row.life_id, age: 0, city: "", events: 0, dead: false, updatedAt: row.updated_at, mode: "normal", modeLabel: "普通模式", modeShort: "普通" };
      }
      const scenario = getLifeScenario(state);
      const meta = getScenarioLabel(scenario);
      return {
        lifeId: row.life_id,
        age: state.basic.age,
        city: state.basic.city,
        events: state.history.length,
        dead: state.dead,
        updatedAt: row.updated_at,
        mode: scenario.mode,
        modeLabel: meta.label,
        modeShort: getScenarioShortLabel(scenario),
      };
    });
  },
  async recentBackgroundAvoid(limit = 5, userId?: string): Promise<BackgroundAvoid> {
    const rows = await recentStates(limit,userId);
    const provinceCodes: string[] = [];
    const occupationIds: string[] = [];
    const opportunity: NonNullable<BackgroundAvoid["opportunity"]>[number][] = [];
    const economy: string[] = [];
    const structure: string[] = [];
    const event: string[] = [];
    for (const row of rows) {
      let state: LifeState;
      try { state = JSON.parse(row.state) as LifeState; } catch { continue; }
      const birth = validateBirthProfile(state.birth);
      if (birth) {
        if (!provinceCodes.includes(birth.location.provinceCode)) provinceCodes.push(birth.location.provinceCode);
        for (const parent of birth.parents) if (!occupationIds.includes(parent.occupation.id)) occupationIds.push(parent.occupation.id);
      }
      const bg = flagsToBackground(state.flags);
      if (!bg) continue;
      if (!economy.includes(bg.economy)) economy.push(bg.economy);
      if (!structure.includes(bg.structure)) structure.push(bg.structure);
      if (!event.includes(bg.event)) event.push(bg.event);
      if (bg.opportunity && !opportunity.includes(bg.opportunity)) opportunity.push(bg.opportunity);
    }
    return {
      provinceCodes, occupationIds,
      opportunity,
      economy: economy as BackgroundAvoid["economy"],
      structure: structure as BackgroundAvoid["structure"],
      event: event as BackgroundAvoid["event"],
    };
  },
  async recentStorylines(limit = 6, maxDomains = 3, userId?: string): Promise<string[]> {
    const rows = await recentStates(limit,userId);
    const seen: string[] = [];
    for (const row of rows) {
      let state: LifeState;
      try { state = JSON.parse(row.state) as LifeState; } catch { continue; }
      for (const domain of extractLifeStorylines(state)) {
        if (!seen.includes(domain)) seen.push(domain);
      }
      if (seen.length >= maxDomains) break;
    }
    return seen.slice(0, maxDomains);
  },
  /**
   * 最近几局真实开局方向。按用户过滤；开发 Mock 局不算真实体验，
   * 没有计划的老存档也跳过（不为补标签回读全文或调用模型）。
   */
  async recentOpeningPlans(limit = 6, userId?: string): Promise<OpeningPlan[]> {
    const rows = await recentStates(limit, userId);
    const plans: OpeningPlan[] = [];
    for (const row of rows) {
      let state: LifeState;
      try { state = JSON.parse(row.state) as LifeState; } catch { continue; }
      if (state.flags?.developerMock === true) continue;
      const plan = validateOpeningPlan(state.openingPlan);
      if (plan) plans.push(plan);
    }
    return plans;
  },
  async delete(id: string): Promise<void> {
    await withTransaction(async () => {
      await query("DELETE FROM transcripts WHERE life_id=$1", [id]);
      await query("DELETE FROM lives WHERE life_id=$1", [id]);
    });
  },
  async getTranscript(id: string): Promise<TranscriptMessage[] | null> {
    const row = (await query("SELECT messages FROM transcripts WHERE life_id=$1", [id])).rows[0];
    if (!row) return null;
    try { const parsed: unknown = JSON.parse(row.messages); return Array.isArray(parsed) ? parsed as TranscriptMessage[] : null; } catch { return null; }
  },
  async setTranscript(id: string, messages: TranscriptMessage[]): Promise<void> {
    await query(`INSERT INTO transcripts VALUES ($1,$2,$3) ON CONFLICT(life_id)
      DO UPDATE SET messages=excluded.messages,updated_at=excluded.updated_at`, [id,JSON.stringify(messages),new Date().toISOString()]);
  },
  close: closePostgres,
};
