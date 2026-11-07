import { describe, it, expect, vi } from 'vitest';
import { normalizeGeneratedEvent, serializeTranscriptEvent, repairGeneratedEvent } from './event-contract';
import { createStarterLife, applyNextEvent } from '../life';
import { prepareEventRequest, buildEndingMessages } from './context';
import { generateNextEvent } from './generate';
import { enforceLifespan } from '../lifespan';
import { createStartLife, resolveStartPlan } from '../modes/start';
const output = {outcome:'continue' as const,timePassed:0,narration:'你把信寄出，对方回信约好见面。',story:'见面地点需要商量。',event:{type:'relationship',title:'见面',importance:0.7},choices:[{id:'A',text:'去公园'},{id:'B',text:'去书店'},{id:'C',text:'先问清时间，改到周末'}],objectiveChanges:{cash:10}};
describe('two scene engine',()=>{
 it('recovers a mixed-version childhood opening without discarding the saved experience',()=>{
 const state=createStarterLife({age:5});state.experienceVersion=3;
 state.history=[{id:'partial',age:5,type:'family',title:'童年',story:'五岁已经发生的经历。',choices:[],importance:0.7}];
 const recovered={...output,timePassed:10};
 expect(normalizeGeneratedEvent(recovered,true,undefined,undefined,state)?.timePassed).toBe(10);
 expect(normalizeGeneratedEvent({...recovered,timePassed:1},true,undefined,undefined,state)).toBeNull();
 const request=prepareEventRequest(state,undefined,[]);
 expect(request.messages[0].content).toContain('本轮timePassed=10');
 expect(JSON.parse(request.messages.at(-1)!.content).turn_task.opening_recovery).toMatchObject({from_age:5,to_age:15,timePassed:10});
 expect(JSON.parse(request.messages.at(-1)!.content).history[0].story).toBe('五岁已经发生的经历。');
 const saved=applyNextEvent(state,{...recovered,event:{type:'relationship',title:'见面',importance:0.7}});
 expect(saved.basic.age).toBe(15);expect(saved.history[0].story).toBe('五岁已经发生的经历。');
 });
 it('requires narration for v3 and preserves same-age transcript',()=>{
 const state={...applyNextEvent(createStarterLife({age:24}), {...output, timePassed:1, event:{type:"relationship",title:"信件",importance:0.7}}),experienceVersion:3 as const};
 expect(normalizeGeneratedEvent({...output,narration:undefined},true,undefined,undefined,state)).toBeNull();
 expect(normalizeGeneratedEvent({...output,choices:output.choices.slice(0,2)},true,undefined,undefined,state)).toBeNull();
 const event=normalizeGeneratedEvent(output,true,undefined,undefined,state)!;
 expect(event.timePassed).toBe(0);
 expect(JSON.parse(serializeTranscriptEvent(event)).narration).toBe(output.narration);
 const first=applyNextEvent(state,event); const next=applyNextEvent(first,event,event.choices[0]);
 expect(next.basic.age).toBe(25); expect(next.finance.cash-first.finance.cash).toBe(10);
 expect(next.history[1].choiceId).toBe('A');expect(next.history[2].choiceId).toBeUndefined();
 expect(JSON.parse(buildEndingMessages(next)[1].content).decision_evidence[0].consequence.narration).toBe(output.narration);
 });
 it('accepts final narration without inventing a decision',()=>{
 const state={...createStarterLife(),experienceVersion:3 as const};
 expect(normalizeGeneratedEvent({...output,outcome:'death',deathCause:'disease',story:'',choices:[]},true,undefined,undefined,state)?.choices).toEqual([]);
 });
 it('requests all childhood in one opening but keeps legacy childhood',()=>{
 const state=createStarterLife();
 expect(prepareEventRequest(state).expectChoices).toBe(false);
 expect(prepareEventRequest({...state,experienceVersion:3}).expectChoices).toBe(true);
 expect(normalizeGeneratedEvent(output)?.timePassed).toBe(1);
 });
 it('validates new opening, early death, repair and old protocol independently',()=>{
 const state=createStartLife(resolveStartPlan({mode:'normal'}, {random:()=>0.5}),'female');
 expect(state.basic.age).toBe(0); expect(state.experienceVersion).toBe(3);
 expect(normalizeGeneratedEvent({...output,timePassed:15},true,undefined,undefined,state)?.timePassed).toBe(15);
 expect(normalizeGeneratedEvent({...output,timePassed:5},true,undefined,undefined,state)).toBeNull();
 expect(normalizeGeneratedEvent({...output,timePassed:4,outcome:'death',deathCause:'accident',story:'',choices:[]},true,undefined,undefined,state)?.timePassed).toBe(4);
 expect(repairGeneratedEvent({...output,narration:undefined},true,undefined,state)).toBeNull();
 expect(serializeTranscriptEvent(normalizeGeneratedEvent(output)!)).not.toContain('narration');
 expect(prepareEventRequest(state).messages[0].content).toContain('narration必须非空');
 expect(prepareEventRequest(createStarterLife()).messages[0].content).not.toContain('narration必须非空');
 });
 it('requires a complete generated death at the lifespan cap and never fabricates one',()=>{
 const state={...createStarterLife({age:80}),experienceVersion:3 as const,lifespan:81};
 const event={...output,event:{type:'relationship' as const,title:'见面',importance:0.7}};
 expect(enforceLifespan(event,state).outcome).toBe('continue');
 expect(()=>enforceLifespan({...event,timePassed:1},state)).toThrow('完整终幕');
 expect(()=>enforceLifespan({...event,timePassed:2},state)).toThrow('超过本局生命终点');
 expect(()=>enforceLifespan(event,{...state,basic:{...state.basic,age:81}})).toThrow('完整终幕');
 const death={...event,timePassed:1,outcome:'death' as const,deathCause:'natural' as const,story:'',choices:[],narration:'你与家人告别，在家中离世。'};
 expect(enforceLifespan(death,state)).toEqual(death);
 });
 it('generates opening in one call and refuses a fabricated fallback',async()=>{
 const original=globalThis.fetch;
 const state=createStartLife(resolveStartPlan({mode:'normal'}, {random:()=>0.5}),'female');
 const config={providerId:'deepseek',apiKey:'synthetic',model:'deepseek-chat'};
 try {
 const fetchMock=vi.fn(async()=>new Response('data: '+JSON.stringify({choices:[{delta:{content:JSON.stringify({...output,timePassed:15,lifeChanges:[],timeline:{resultAge:null,sceneAge:15},stateUpdate:{},objectiveChanges:{occupation:"学生",careerStage:"student",education:"初中在读"},choices:output.choices.map(choice=>({...choice,requiresFollowUp:false,commitments:[]}))})}}]})+'\n\ndata: [DONE]\n\n'));
 globalThis.fetch=fetchMock as typeof fetch;
 const event=await generateNextEvent(state,undefined,config);
 expect(event.timePassed).toBe(15);expect(event.narration).toBe(output.narration);expect(fetchMock).toHaveBeenCalledTimes(1);
 globalThis.fetch=vi.fn(async()=>new Response('unavailable',{status:503})) as typeof fetch;
 await expect(generateNextEvent(state,undefined,config)).rejects.toThrow('本轮未推进');
 expect(state.history).toHaveLength(0);
 } finally {globalThis.fetch=original;}
 });
});

it("persists graduation and employment facts through model normalization and state application", () => {
  const state = {
    ...applyNextEvent(createStarterLife({ age: 23 }), {
      ...output, event: { ...output.event, type: "relationship" }, objectiveChanges: {},
    }),
    experienceVersion: 3 as const,
  };
  state.basic.education = "大学在读（城乡规划）";
  const event = normalizeGeneratedEvent({
    ...output,
    objectiveChanges: {
      education: "本科毕业（城乡规划）", occupation: "助理规划师", companyType: "规划院",
      careerStage: "early", cash: 800, assets: 800,
    },
  }, true, undefined, undefined, state)!;
  const next = applyNextEvent(state, event);
  expect(next.basic.education).toBe("本科毕业（城乡规划）");
  expect(next.career).toMatchObject({ occupation: "助理规划师", companyType: "规划院", careerStage: "early" });
  expect(next.finance.cash).toBe(8800);
  expect(next.finance.assets).toBe(8800);
  expect(state.career.companyType).toBe("家庭");
});
