import {afterEach,expect,it} from "vitest";
import {lifeGeneration} from "./life-generation";
import {lifeStore} from "./life-store";
import {createStarterLife} from "./life";
afterEach(()=>lifeStore.close());
it("allows one generator per life and fences stale workers after lease recovery",()=>{
 const life=createStarterLife();lifeStore.set(life,"alice");
 const first=lifeGeneration.begin(life.lifeId,"alice",1000);
 expect(()=>lifeGeneration.begin(life.lifeId,"alice",2000)).toThrow();
 expect(()=>lifeGeneration.begin(life.lifeId,"bob",2000)).toThrow();
 const second=lifeGeneration.begin(life.lifeId,"alice",700000);
 expect(()=>lifeGeneration.save(first,life,[],2000)).toThrow();
 lifeGeneration.save(second,life,[{role:"user",content:"next"}],700001);
 expect(lifeStore.getTranscript(life.lifeId)).toHaveLength(1);
});
