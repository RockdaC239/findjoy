import { randomUUID } from "node:crypto";
import { lifeStore } from "./life-store";
import { query, withTransaction } from "./database";
import { CommerceError } from "./commerce-store";
import type { LifeState } from "./life";
import type { TranscriptMessage } from "./model-adapter";
interface GenerationLease {lifeId:string;userId:string;token:string}
async function assertLease(lease: GenerationLease, now: number) {
  const row = (await query("SELECT token FROM joy_generation_locks WHERE life_id=$1 AND user_id=$2 AND expires_at>$3 FOR UPDATE", [lease.lifeId,lease.userId,now])).rows[0];
  if (row?.token!==lease.token) throw new CommerceError("GENERATION_EXPIRED","生成已过期，请恢复最新人生");
}
export const lifeGeneration = {
  async begin(lifeId: string,userId: string,now=Date.now()): Promise<GenerationLease> {
    return withTransaction(async () => {
      if (!await lifeStore.get(lifeId,userId)) throw new CommerceError("NOT_FOUND","人生不存在",404);
      const token=randomUUID();
      const result=await query(`INSERT INTO joy_generation_locks VALUES ($1,$2,$3,$4) ON CONFLICT(life_id)
        DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE joy_generation_locks.expires_at<=$5`, [lifeId,userId,token,now+600000,now]);
      if (!result.rowCount) throw new CommerceError("GENERATION_PENDING","故事正在生成，请稍后恢复最新进度");
      return {lifeId,userId,token};
    });
  },
  async save(lease: GenerationLease,state: LifeState,transcript: TranscriptMessage[]|null,now=Date.now()): Promise<void> {
    await withTransaction(async () => {
      await assertLease(lease,now);
      if (state.lifeId!==lease.lifeId) throw new Error("人生标识不一致");
      await lifeStore.set(state,lease.userId);
      if (transcript) await lifeStore.setTranscript(state.lifeId,transcript);
      await lifeGeneration.release(lease);
    });
  },
  async release(lease: GenerationLease): Promise<void> {
    await query("DELETE FROM joy_generation_locks WHERE life_id=$1 AND user_id=$2 AND token=$3", [lease.lifeId,lease.userId,lease.token]);
  },
  async getEnding(lifeId: string,userId: string): Promise<unknown|null> {
    const row = (await query("SELECT ending FROM joy_endings WHERE life_id=$1 AND user_id=$2", [lifeId,userId])).rows[0];
    return row ? JSON.parse(row.ending) : null;
  },
  async saveEnding(lease: GenerationLease,ending: unknown): Promise<void> {
    await withTransaction(async () => {
      await assertLease(lease,Date.now());
      await query("INSERT INTO joy_endings VALUES ($1,$2,$3)", [lease.lifeId,lease.userId,JSON.stringify(ending)]);
      await lifeGeneration.release(lease);
    });
  },
};
