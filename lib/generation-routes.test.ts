import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({currentUser:vi.fn(),stream:vi.fn(),ending:vi.fn()}));
vi.mock("./auth",()=>({currentUser:mocks.currentUser,appOrigin:()=>"https://findfire.club"}));
vi.mock("./model-adapter",async(importOriginal)=>({...await importOriginal<typeof import("./model-adapter")>(),streamNextEvent:mocks.stream,generateEnding:mocks.ending,resolveModelConfig:()=>({apiKey:"synthetic-key",providerId:"test",baseUrl:"https://model.invalid/v1",model:"test-model",inputCostPerMillion:1,outputCostPerMillion:2})}));
import { setupTestPostgres } from "./test-postgres";
import * as capacity from "./generation-capacity";
import { acquireGeneration, releaseGeneration } from "./generation-capacity";
import { commerceStore } from "./commerce-store";
import { lifeStore } from "./life-store";
import { createStarterLife, buildEnding } from "./life";
import { lifeGeneration } from "./life-generation";
import { mockLifeEvent } from "./mock-life";
import { POST as start } from "../app/api/life/start/route";
import { POST as next } from "../app/api/life/[id]/next/route";
import { POST as ending } from "../app/api/life/[id]/ending/route";
import { query } from "./database";
setupTestPostgres();
afterEach(()=>vi.restoreAllMocks());
beforeEach(()=>{mocks.currentUser.mockResolvedValue({id:"alice"});mocks.stream.mockReset();mocks.ending.mockReset();vi.stubEnv("FINDJOY_GENERATION_MAX_CONCURRENT","1");vi.stubEnv("FINDJOY_GENERATION_ENABLED","true");});
const request=(body:unknown={},key="start")=>new Request("https://findfire.club/findjoy/api/life/start",{method:"POST",headers:{origin:"https://findfire.club","Content-Type":"application/json","Idempotency-Key":key},body:JSON.stringify(body)});
it("rejects overloaded start, next and ending before model work and credit reservation",async()=>{
 const slot=await acquireGeneration("other");
 const opening=await start(request());expect(opening.status).toBe(503);expect(opening.headers.get("retry-after")).toBe("5");
 expect(await commerceStore.balance("alice")).toEqual({available:0,held:0});
 const life=createStarterLife();life.history=[{id:"current",age:0,type:"family",title:"start",story:"start",importance:0.5}];await lifeStore.set(life,"alice");
 const params={params:Promise.resolve({id:life.lifeId})};
 expect((await next(request({expectedEventId:"current"}),params)).status).toBe(503);
 life.dead=true;await lifeStore.set(life,"alice");expect((await ending(request(),params)).status).toBe(503);
 expect(mocks.stream).not.toHaveBeenCalled();expect(mocks.ending).not.toHaveBeenCalled();
 await releaseGeneration(slot);
});
it("continues an admitted opening after cancellation, saves it once and replays it while paused",async()=>{
 let finish!:()=>void;const gate=new Promise<void>(resolve=>{finish=resolve;});
 mocks.stream.mockImplementation(async function*(state){await gate;yield {text:"story"};return mockLifeEvent(state);});
 const response=await start(request());const reader=response.body!.getReader();await reader.read();await reader.cancel();
 expect((await query("SELECT count(*)::integer AS n FROM joy_generation_admissions")).rows).toEqual([{n:1}]);
 finish();
 await vi.waitFor(async()=>{expect(await commerceStore.balance("alice")).toEqual({available:20,held:0});expect((await query("SELECT count(*)::integer AS n FROM joy_generation_admissions")).rows).toEqual([{n:0}]);});
 vi.stubEnv("FINDJOY_GENERATION_ENABLED","false");
 const replay=await start(request());expect(replay.status).toBe(200);expect((await replay.json()).state.lifeId).toBeTypeOf("string");
 expect(mocks.stream).toHaveBeenCalledTimes(1);
});
it("releases admission and refunds the opening when generation fails",async()=>{
 mocks.stream.mockImplementation(async function*(){yield {text:"partial"};throw new Error("upstream");});
 const response=await start(request());expect(await response.text()).toContain("START_FAILED");
 expect(await commerceStore.balance("alice")).toEqual({available:40,held:0});
 expect((await query("SELECT count(*)::integer AS n FROM joy_generation_admissions")).rows).toEqual([{n:0}]);
});

it("recovers a committed opening when confirmation fails instead of telling the client to discard its key",async()=>{
 mocks.stream.mockImplementation(async function*(state){yield {text:"story"};return mockLifeEvent(state);});
 const commit=capacity.commitGeneration;
 vi.spyOn(capacity,"commitGeneration").mockImplementationOnce(async (token,work,now)=>{
   await commit(token,work,now);throw new Error("commit reply lost");
 });
 const response=await start(request());const text=await response.text();
 expect(text).toContain("event: complete");expect(text).not.toContain("START_FAILED");
 expect(await commerceStore.balance("alice")).toEqual({available:20,held:0});
 const replay=await start(request());expect(replay.status).toBe(200);expect(mocks.stream).toHaveBeenCalledTimes(1);
});

it("preserves an uncertain opening key when the database cannot confirm recovery",async()=>{
 mocks.stream.mockImplementation(async function*(){yield {text:"partial"};throw new Error("upstream");});
 vi.spyOn(commerceStore,"failLife").mockRejectedValueOnce(new Error("database unavailable"));
 vi.spyOn(commerceStore,"getOperation").mockRejectedValueOnce(new Error("database unavailable"));
 const response=await start(request());const text=await response.text();
 expect(text).toContain("START_UNCONFIRMED");expect(text).not.toContain("START_FAILED");
 expect(await commerceStore.balance("alice")).toEqual({available:20,held:20});
});

it("rejects legacy generation output before saving a version3 opening and refunds its reservation", async () => {
 mocks.stream.mockImplementation(async function* () {
   return {timePassed:5,story:"旧版童年",event:{type:"family",title:"童年",importance:0.7},choices:[],objectiveChanges:{}};
 });
 const response=await start(request());
 expect(await response.text()).toContain("START_FAILED");
 expect(await commerceStore.balance("alice")).toEqual({available:40,held:0});
 expect((await query("SELECT count(*)::integer AS n FROM lives WHERE state::jsonb->'basic'->>'age'='5'")).rows).toEqual([{n:0}]);
});

it("resumes a partial opening in place and replaces the mixed transcript without charging again", async () => {
 const life=createStarterLife({age:5});life.experienceVersion=3;
 life.history=[{id:"partial",age:5,type:"family",title:"童年",story:"已有的童年经历",choices:[],importance:0.7}];
 await lifeStore.set(life,"alice");
 await lifeStore.setTranscript(life.lifeId,[{role:"assistant",content:'{"story":"旧协议童年"}'}]);
 mocks.stream.mockImplementation(async function*(){return {
  outcome:"continue",timePassed:10,narration:"这十年你继续长大。",story:"十五岁的一件事。",
  event:{type:"family",title:"新的决定",importance:0.7},choices:[{id:"A",text:"和家人谈谈"},{id:"B",text:"先想一想"},{id:"C",text:"先听他们说完"}],objectiveChanges:{},
 };});
 const response=await next(request({expectedEventId:"partial"}),{params:Promise.resolve({id:life.lifeId})});
 expect(await response.text()).toContain("event: complete");
 const saved=(await lifeStore.get(life.lifeId,"alice"))!;
 expect(saved.basic.age).toBe(15);expect(saved.history).toHaveLength(2);
 expect(saved.history[0]).toEqual(life.history[0]);
 const transcript=(await lifeStore.getTranscript(life.lifeId))!;
 expect(transcript).toHaveLength(2);
 expect(JSON.parse(transcript[0].content).history[0].story).toBe("已有的童年经历");
 expect(JSON.parse(transcript[1].content).narration).toBe("这十年你继续长大。");
 expect(await commerceStore.balance("alice")).toEqual({available:0,held:0});
});

it("persists ending usage across failed and successful attempts and replays it without new model work", async () => {
 const life=createStarterLife({age:82});life.dead=true;await lifeStore.set(life,"alice");
 mocks.ending.mockImplementation(async (_state,_config,onUsage)=>{
   onUsage({prompt_tokens:100,completion_tokens:20,total_tokens:120,prompt_cache_hit_tokens:30});
   onUsage({prompt_tokens:120,completion_tokens:40,total_tokens:160,prompt_cache_miss_tokens:80});
   onUsage({prompt_tokens:-99,completion_tokens:NaN,total_tokens:Infinity});
   return buildEnding(life);
 });
 const params={params:Promise.resolve({id:life.lifeId})};
 const response=await ending(request(),params);expect(response.status).toBe(200);
 const result=(await response.json()).ending;
 expect(result.usage).toMatchObject({promptTokens:220,completionTokens:60,totalTokens:280,promptCacheHitTokens:30,promptCacheMissTokens:80,model:"test-model",provider:"https://model.invalid/v1"});
 expect(result.usage.estimatedCostUsd).toBeCloseTo(0.00034);
 expect(JSON.stringify(result)).not.toContain("synthetic-key");
 expect(await lifeGeneration.getEnding(life.lifeId,"alice")).toEqual(result);
 const replay=await ending(request(),params);expect((await replay.json()).ending).toEqual(result);
 expect(mocks.ending).toHaveBeenCalledTimes(1);
});
