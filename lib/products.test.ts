import {afterEach,expect,it,vi} from "vitest";
import {products} from "./products";
afterEach(()=>vi.unstubAllEnvs());
it("keeps mock prices out of real payment mode and validates configured products",()=>{
 vi.stubEnv("FINDJOY_PAYMENTS_MODE","demo");expect(products().every(item=>item.demo)).toBe(true);
 vi.stubEnv("FINDJOY_PAYMENTS_MODE","live");vi.stubEnv("FINDJOY_PRODUCTS_JSON","");expect(()=>products()).toThrow();
 vi.stubEnv("FINDJOY_PRODUCTS_JSON",JSON.stringify([{id:"trial",name:"真实配置",credits:1,amountFen:100}]));expect(products()[0].demo).toBe(false);
 vi.stubEnv("FINDJOY_PRODUCTS_JSON",JSON.stringify([{id:"trial",name:"错误配置",credits:1,amountFen:0.1}]));expect(()=>products()).toThrow();
});

it("offers the four approved points packs without unusable normal-life remainders",()=>{
 vi.stubEnv("FINDJOY_PAYMENTS_MODE","demo");
 expect(products().map(p=>[p.amountFen,p.credits])).toEqual([[990,100],[1990,220],[2990,360],[5990,800]]);
 expect(products().every(p=>p.credits%20===0)).toBe(true);
});
