import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as xiaodou from "./xiaodou";
import { createPayment,payerIp,processPaymentWebhook,validatePayUrl } from "./payments";
import { identityStore } from "./identity-store";
import { commerceStore } from "./commerce-store";
import { lifeStore } from "./life-store";

const keys=generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
beforeEach(()=>{lifeStore.close();vi.stubEnv("LIFE_DB_PATH",":memory:");});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();lifeStore.close();});

describe("payment trust boundary",()=>{
  it("only accepts HTTPS cashier links from configured origins",()=>{
    vi.stubEnv("XIAODOU_CASHIER_ORIGINS","https://cashier.example");
    expect(validatePayUrl("https://cashier.example/pay?token=opaque")).toBe("https://cashier.example/pay?token=opaque");
    for(const url of ["https://evil.test/pay","http://cashier.example/pay","https://user:pass@cashier.example/pay"])expect(()=>validatePayUrl(url)).toThrow();
  });
  it("rejects forged, wrong-app and wrong-amount notifications and grants valid duplicate events once",async ()=>{
    vi.spyOn(xiaodou,"xiaodouConfig").mockReturnValue({base:new URL("https://api.example"),appId:"our-app",keyId:"merchant",privateKey:keys.privateKey,keys:{platform:keys.publicKey}});
    const id=(await identityStore.resolveUser("https://auth.example","alice")).id;
    const order=commerceStore.createOrder(id,{id:"test",name:"test",credits:3,amountFen:790,demo:false},"once","ALIPAY_H5");
    function event(overrides:Record<string,unknown>={}){
      const data={eventId:"event-1",eventType:"PAYMENT_SUCCEEDED",appId:"our-app",outTradeNo:order.id,grossAmountFen:790,eventAmountFen:790,status:"SUCCEEDED",...overrides};
      const raw=Buffer.from(JSON.stringify(data));
      const headers=new Headers({"X-XD-Webhook-Event-Id":"event-1","X-XD-Webhook-Event-Type":"PAYMENT_SUCCEEDED","X-XD-Webhook-Timestamp":Math.floor(Date.now()/1000).toString(),"X-XD-Webhook-Nonce":"fresh","X-XD-Webhook-Key-Id":"platform"});
      headers.set("X-XD-Webhook-Signature",sign("RSA-SHA256",Buffer.from(xiaodou.webhookSigningString(headers,raw)),keys.privateKey).toString("base64"));
      return {raw,headers};
    }
    let input=event({appId:"other-app"});expect(()=>processPaymentWebhook(input.headers,input.raw)).toThrow();
    input=event({grossAmountFen:791,eventAmountFen:791});expect(()=>processPaymentWebhook(input.headers,input.raw)).toThrow();
    input=event();expect(()=>processPaymentWebhook(input.headers,Buffer.concat([input.raw,Buffer.from(" ")]))).toThrow();
    expect(commerceStore.balance(id).available).toBe(0);
    processPaymentWebhook(input.headers,input.raw);processPaymentWebhook(input.headers,input.raw);
    expect(commerceStore.balance(id).available).toBe(3);
  });
});

it("recovers the same payment attempt after its successful response was lost",async()=>{
 vi.stubEnv("FINDJOY_APP_ORIGIN","https://findfire.club");vi.stubEnv("XIAODOU_CASHIER_ORIGINS","https://cashier.example");
 const id=(await identityStore.resolveUser("https://auth.example","alice")).id;
 const created=commerceStore.createOrder(id,{id:"test",name:"test",credits:1,amountFen:100,demo:false},"attempt-test","ALIPAY_H5");
 commerceStore.saveOrderRequest(created.id,JSON.stringify({outTradeNo:created.id}));
 const order=commerceStore.getOrder(created.id,id)!;
 let attempts=0;const requestIds:string[]=[];
 vi.spyOn(xiaodou,"xiaodouRequest").mockImplementation(async(method,path,_body,requestId)=>{
  const snapshot={outTradeNo:order.id,amountFen:100,currency:"CNY",channel:"ALIPAY_H5",status:"PAYING",expireAt:new Date(Date.now()+600000).toISOString()};
  if(method==="GET")return {...snapshot,...(attempts===0?{nextAction:"CREATE_ATTEMPT"}:{})};
  if(path.endsWith("/attempts")){
   attempts++;requestIds.push(requestId!);
   if(attempts===1)throw new Error("response lost after platform commit");
   return {...snapshot,payUrl:"https://cashier.example/new-attempt"};
  }
  return {...snapshot,payUrl:"https://cashier.example/obsolete-attempt"};
 });
 await expect(createPayment(order,new Request("https://findfire.club",{headers:{"x-real-ip":"8.8.8.8"}}))).rejects.toThrow("response lost");
 const recovered=await createPayment(order,new Request("https://findfire.club",{headers:{"x-real-ip":"8.8.8.8"}}));
 expect(recovered.payUrl).toBe("https://cashier.example/new-attempt");expect(requestIds).toHaveLength(2);expect(requestIds[0]).toBe(requestIds[1]);
});


it("uses an explicit public payer IP only for loopback development",()=>{
 vi.stubEnv("NODE_ENV","development");vi.stubEnv("FINDJOY_APP_ORIGIN","http://localhost:3000");vi.stubEnv("FINDJOY_DEV_PAYER_IP","8.8.8.8");
 expect(payerIp(new Request("http://localhost:3000"))).toBe("8.8.8.8");
 vi.stubEnv("FINDJOY_DEV_PAYER_IP","127.0.0.1");expect(()=>payerIp(new Request("http://localhost:3000"))).toThrow();
 vi.stubEnv("FINDJOY_DEV_PAYER_IP","8.8.8.8");vi.stubEnv("NODE_ENV","production");expect(()=>payerIp(new Request("http://localhost:3000"))).toThrow();
 vi.stubEnv("NODE_ENV","development");vi.stubEnv("FINDJOY_APP_ORIGIN","https://findfire.club");expect(()=>payerIp(new Request("https://findfire.club"))).toThrow();
});

it("omits an HTTP local return URL while preserving the signed order and payment checks",async()=>{
 vi.stubEnv("NODE_ENV","development");vi.stubEnv("FINDJOY_APP_ORIGIN","http://localhost:3000");vi.stubEnv("FINDJOY_DEV_PAYER_IP","8.8.8.8");vi.stubEnv("XIAODOU_CASHIER_ORIGINS","https://cashier.example");
 const id=(await identityStore.resolveUser("https://auth.example","local-test")).id;
 const order=commerceStore.createOrder(id,{id:"test",name:"test",credits:1,amountFen:1,demo:false},"local-test","ALIPAY_H5");
 vi.spyOn(xiaodou,"xiaodouRequest").mockImplementation(async(_method,_path,body)=>{
  const payload=JSON.parse(body!);expect(payload).not.toHaveProperty("returnUrl");expect(payload.payerClientIp).toBe("8.8.8.8");expect(payload.amountFen).toBe(1);
  return {outTradeNo:order.id,amountFen:1,currency:"CNY",channel:"ALIPAY_H5",status:"PAYING",expireAt:new Date(Date.now()+600000).toISOString(),payUrl:"https://cashier.example/pay"};
 });
 expect((await createPayment(order,new Request("http://localhost:3000"))).payUrl).toBe("https://cashier.example/pay");
});
