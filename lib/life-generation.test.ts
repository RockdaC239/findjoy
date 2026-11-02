import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import {afterEach,expect,it} from "vitest";
import {lifeGeneration} from "./life-generation";
import {lifeStore} from "./life-store";
import {createStarterLife} from "./life";
afterEach(async ()=>(await lifeStore.close()));
it("allows one generator per life and fences stale workers after lease recovery",async ()=>{
 const life=createStarterLife();await lifeStore.set(life,"alice");
 const first=await lifeGeneration.begin(life.lifeId,"alice",1000);
 await expect(async ()=>(await lifeGeneration.begin(life.lifeId,"alice",2000))).rejects.toThrow();
 await expect(async ()=>(await lifeGeneration.begin(life.lifeId,"bob",2000))).rejects.toThrow();
 const second=await lifeGeneration.begin(life.lifeId,"alice",700000);
 await expect(async ()=>(await lifeGeneration.save(first,life,[],2000))).rejects.toThrow();
 await lifeGeneration.save(second,life,[{role:"user",content:"next"}],700001);
 expect(await lifeStore.getTranscript(life.lifeId)).toHaveLength(1);
});
