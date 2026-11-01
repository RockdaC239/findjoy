import { generateKeyPairSync, sign } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as xiaodou from "./xiaodou";
import { processPaymentWebhook,validatePayUrl } from "./payments";
import { identityStore } from "./identity-store";
import { commerceStore } from "./commerce-store";
import { lifeStore } from "./life-store";

const keys=generateKeyPairSync("rsa",{modulusLength:2048,publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllEnvs();lifeStore.close();});

describe("payment trust boundary",()=>{
  it("only accepts HTTPS cashier links from configured origins",()=>{
    vi.stubEnv("XIAODOU_CASHIER_ORIGINS","https://cashier.example");
    expect(validatePayUrl("https://cashier.example/pay?token=opaque")).toBe("https://cashier.example/pay?token=opaque");
    for(const url of ["https://evil.test/pay","http://cashier.example/pay","https://user:pass@cashier.example/pay"])expect(()=>validatePayUrl(url)).toThrow();
  });
  it("rejects forged, wrong-app and wrong-amount notifications and grants valid duplicate events once",()=>{
    vi.spyOn(xiaodou,"xiaodouConfig").mockReturnValue({base:new URL("https://api.example"),appId:"our-app",keyId:"merchant",privateKey:keys.privateKey,keys:{platform:keys.publicKey}});
    const id=identityStore.resolveUser("https://auth.example","alice").id;
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
