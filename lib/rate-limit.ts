import {createHash} from "node:crypto";
import {getDb} from "./life-store";

export function takeRateLimit(subject:string,action:string,limit:number,windowMs:number,now=Date.now()):boolean {
 const key=createHash("sha256").update(`${action}:${subject}`).digest("hex");
 const db=getDb();
 db.exec("CREATE TABLE IF NOT EXISTS joy_rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires_at INTEGER NOT NULL)");
 return db.transaction(()=>{
  db.prepare("DELETE FROM joy_rate_limits WHERE expires_at<=?").run(now);
  const result=db.prepare(`INSERT INTO joy_rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<?`).run(key,now+windowMs,limit);
  return result.changes===1;
 }).immediate();
}
