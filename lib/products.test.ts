import {afterEach,expect,it,vi} from "vitest";
import {products} from "./products";
import { NORMAL_LIFE_POINTS, SIGNUP_POINTS } from "./points";
afterEach(()=>vi.unstubAllEnvs());
it("keeps mock prices out of real payment mode and validates configured products",()=>{
 vi.stubEnv("FINDJOY_PAYMENTS_MODE","demo");expect(products().every(item=>item.demo)).toBe(true);
 vi.stubEnv("FINDJOY_PAYMENTS_MODE","live");vi.stubEnv("FINDJOY_PRODUCTS_JSON","");expect(()=>products()).toThrow();
 vi.stubEnv("FINDJOY_PRODUCTS_JSON",JSON.stringify([{id:"trial",name:"真实配置",credits:1,amountFen:100}]));expect(products()[0].demo).toBe(false);
 vi.stubEnv("FINDJOY_PRODUCTS_JSON",JSON.stringify([{id:"trial",name:"错误配置",credits:1,amountFen:0.1}]));expect(()=>products()).toThrow();
});

it("offers a purchasable single life and four approved packs with two free signup lives",()=>{
 vi.stubEnv("FINDJOY_PAYMENTS_MODE","demo");
 expect(products().map(p=>[p.id,p.name,p.amountFen,p.credits])).toEqual([
  ["single","普通模式单次",590,20],
  ["light","尝鲜包",990,40],
  ["standard","标准包",1990,100],
  ["explore","探索包",3990,220],
  ["deep","深度包",7990,480],
 ]);
 expect(products().every(p=>p.credits%NORMAL_LIFE_POINTS===0)).toBe(true);
 expect(SIGNUP_POINTS).toBe(2*NORMAL_LIFE_POINTS);
 const single=products()[0];
 const packs=products().slice(1);
 expect(packs.map(p=>(p.amountFen/(p.credits/NORMAL_LIFE_POINTS)/100).toFixed(2))).toEqual(["4.95","3.98","3.63","3.33"]);
 expect(Math.round((1-packs[1].amountFen/(packs[1].credits/NORMAL_LIFE_POINTS)/single.amountFen)*100)).toBe(33);
});

it("keeps the one-fen test product private and follows the configured payment mode", () => {
 vi.stubEnv("FINDJOY_PAYMENTS_MODE", "demo");
 expect(products().find(item => item.id === "developer-test")).toBeUndefined();
 expect(products({ developer: true }).find(item => item.id === "developer-test")).toMatchObject({ amountFen: 1, credits: 20, demo: true });
 vi.stubEnv("FINDJOY_PAYMENTS_MODE", "live");
 vi.stubEnv("FINDJOY_PRODUCTS_JSON", JSON.stringify([{ id: "single", name: "普通模式", credits: 20, amountFen: 590 }]));
 expect(products({ developer: true }).find(item => item.id === "developer-test")).toMatchObject({ amountFen: 1, demo: false });
 expect(products()).toHaveLength(1);
});
