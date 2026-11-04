import { expect, it, vi } from "vitest";
import { setupTestPostgres } from "./test-postgres";
import { acquireGeneration, releaseGeneration, commitGeneration } from "./generation-capacity";
import { query } from "./database";
setupTestPostgres();
it("enforces global and per-user limits across concurrent admissions",async()=>{
 vi.stubEnv("FINDJOY_GENERATION_MAX_CONCURRENT","2");
 const attempts=await Promise.allSettled(Array.from({length:12},(_,i)=>acquireGeneration(`user-${i}`,1000)));
 const accepted=attempts.filter((a):a is PromiseFulfilledResult<string>=>a.status==='fulfilled');
 expect(accepted).toHaveLength(2);
 await expect(acquireGeneration("another",1001)).rejects.toMatchObject({status:503});
 await releaseGeneration(accepted[0].value);
 const same=await acquireGeneration("one-user",1002);
 await releaseGeneration(accepted[1].value);
 await expect(acquireGeneration("one-user",1003)).rejects.toMatchObject({status:429});
 await releaseGeneration(same);
 expect(await acquireGeneration("one-user",1004)).toBeTypeOf("string");
});
it("lets the developer bypass only the per-user generation rate limit",async()=>{
 vi.stubEnv("FINDJOY_GENERATION_MAX_CONCURRENT","4");
 for(let i=0;i<20;i++){const token=await acquireGeneration("developer-rate",1000);await releaseGeneration(token);}
 await expect(acquireGeneration("developer-rate",1000)).rejects.toMatchObject({status:429});
 const token=await acquireGeneration("developer-rate",1000,{skipRateLimit:true});
 expect(token).toBeTypeOf("string");
 await releaseGeneration(token);
});
it("fences expired workers, reclaims abandoned slots and supports pausing new work",async()=>{
 vi.stubEnv("FINDJOY_GENERATION_MAX_CONCURRENT","1");
 const old=await acquireGeneration("alice",1000);
 const next=await acquireGeneration("bob",700000);
 await expect(commitGeneration(old,async()=>query("INSERT INTO joy_accounts(user_id) VALUES ('bad')"),700001)).rejects.toThrow();
 expect((await query("SELECT user_id FROM joy_accounts")).rows).toEqual([]);
 await commitGeneration(next,async()=>query("INSERT INTO joy_accounts(user_id) VALUES ('good')"),700001);
 vi.stubEnv("FINDJOY_GENERATION_ENABLED","false");
 await releaseGeneration(next);
 await expect(acquireGeneration("bob",700002)).rejects.toMatchObject({status:503});
});
