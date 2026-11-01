import {randomUUID} from "node:crypto";
import {getDb,lifeStore} from "./life-store";
import {CommerceError} from "./commerce-store";
import type {LifeState} from "./life";
import type {TranscriptMessage} from "./model-adapter";
interface GenerationLease {lifeId:string;userId:string;token:string}
function database(){
 const db=getDb();db.exec(`CREATE TABLE IF NOT EXISTS joy_generation_locks(life_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,token TEXT NOT NULL,expires_at INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS joy_endings(life_id TEXT PRIMARY KEY,user_id TEXT NOT NULL,ending TEXT NOT NULL);`);return db;
}
function assertLease(lease:GenerationLease,now:number){
 const row=database().prepare("SELECT token FROM joy_generation_locks WHERE life_id=? AND user_id=? AND expires_at>?").get(lease.lifeId,lease.userId,now) as {token:string}|undefined;
 if(row?.token!==lease.token)throw new CommerceError("GENERATION_EXPIRED","生成已过期，请恢复最新人生");
}
export const lifeGeneration={
 begin(lifeId:string,userId:string,now=Date.now()):GenerationLease{
  const db=database();return db.transaction(()=>{
   if(!lifeStore.get(lifeId,userId))throw new CommerceError("NOT_FOUND","人生不存在",404);
   const token=randomUUID();
   const result=db.prepare(`INSERT INTO joy_generation_locks VALUES (?,?,?,?) ON CONFLICT(life_id) DO UPDATE SET token=excluded.token,expires_at=excluded.expires_at WHERE joy_generation_locks.expires_at<=?`).run(lifeId,userId,token,now+600000,now);
   if(!result.changes)throw new CommerceError("GENERATION_PENDING","故事正在生成，请稍后恢复最新进度");
   return {lifeId,userId,token};
  }).immediate();
 },
 save(lease:GenerationLease,state:LifeState,transcript:TranscriptMessage[]|null,now=Date.now()):void{
  database().transaction(()=>{
   assertLease(lease,now);if(state.lifeId!==lease.lifeId)throw new Error("人生标识不一致");
   lifeStore.set(state,lease.userId);if(transcript)lifeStore.setTranscript(state.lifeId,transcript);
   lifeGeneration.release(lease);
  }).immediate();
 },
 release(lease:GenerationLease):void{
  database().prepare("DELETE FROM joy_generation_locks WHERE life_id=? AND user_id=? AND token=?").run(lease.lifeId,lease.userId,lease.token);
 },
 getEnding(lifeId:string,userId:string):unknown|null{
  const row=database().prepare("SELECT ending FROM joy_endings WHERE life_id=? AND user_id=?").get(lifeId,userId) as {ending:string}|undefined;
  return row?JSON.parse(row.ending):null;
 },
 saveEnding(lease:GenerationLease,ending:unknown):void{
  database().transaction(()=>{assertLease(lease,Date.now());database().prepare("INSERT INTO joy_endings VALUES (?,?,?)").run(lease.lifeId,lease.userId,JSON.stringify(ending));lifeGeneration.release(lease);}).immediate();
 },
};
