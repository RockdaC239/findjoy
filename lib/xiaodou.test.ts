import { generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it } from "vitest";
import { requestSigningString, responseSigningString, webhookSigningString, verifyPlatformSignature } from "./xiaodou";

const keys = generateKeyPairSync("rsa", {modulusLength:2048, publicKeyEncoding:{type:"spki",format:"pem"},privateKeyEncoding:{type:"pkcs8",format:"pem"}});

describe("Xiaodou signature contract v1", () => {
  it("matches the vendor golden request vector byte for byte", () => {
    expect(requestSigningString({method:"POST",url:new URL("https://pay.example/api/open/v1/payments?b=2&a=1"),timestamp:"1758888888",nonce:"6f1c2f7a9d0b4e51",appId:"xdop_example000000000",keyId:"kid_example",requestId:"018f2c1e-8b21-7c3a-9f10-2b7c9a1d4e55",contentType:"application/json; charset=utf-8",body:'{"outTradeNo":"SHOP20260926A0001"}'}))
      .toBe("XD-Signature-v1\nPOST\n/api/open/v1/payments\na=1&b=2\n1758888888\n6f1c2f7a9d0b4e51\nxdop_example000000000\nkid_example\n018f2c1e-8b21-7c3a-9f10-2b7c9a1d4e55\napplication/json\n954802c8e1bc119a1927d07af5c27d7c29c6d9467d8e93ccf83ebca8ef0252c7");
  });
  it("verifies response signatures against pinned keys and rejects altered raw bytes or expired signatures", () => {
    const value=responseSigningString(200,"application/json; charset=utf-8","request-1","1000","nonce","platform-1",Buffer.from('{"paid":true}'));
    const signature=sign("RSA-SHA256",Buffer.from(value),keys.privateKey).toString("base64");
    expect(verifyPlatformSignature(value,signature,"platform-1","1000",{"platform-1":keys.publicKey},1_000_000)).toBe(true);
    expect(verifyPlatformSignature(value+" ",signature,"platform-1","1000",{"platform-1":keys.publicKey},1_000_000)).toBe(false);
    expect(verifyPlatformSignature(value,signature,"unknown","1000",{"platform-1":keys.publicKey},1_000_000)).toBe(false);
    expect(verifyPlatformSignature(value,signature,"platform-1","1000",{"platform-1":keys.publicKey},2_000_000)).toBe(false);
  });
  it("keeps webhook and response canonical strings distinct and binds event type and raw bytes", () => {
    const headers=new Headers({"X-XD-Webhook-Event-Id":"event-1","X-XD-Webhook-Event-Type":"PAYMENT_SUCCEEDED","X-XD-Webhook-Timestamp":"1000","X-XD-Webhook-Nonce":"nonce","X-XD-Webhook-Key-Id":"platform-1"});
    const body=Buffer.from('{"eventId":"event-1"}');
    const canonical=webhookSigningString(headers,body);
    expect(canonical.split("\n")).toHaveLength(7);
    headers.set("X-XD-Webhook-Event-Type","REFUND_SUCCEEDED");
    expect(webhookSigningString(headers,body)).not.toBe(canonical);
  });
});

it("requires a signed success response and signs the request with the configured merchant key",async()=>{
 const {mkdtempSync,writeFileSync,rmSync}=await import("node:fs");
 const {tmpdir}=await import("node:os");
 const {join}=await import("node:path");
 const {vi}=await import("vitest");
 const {xiaodouRequest}=await import("./xiaodou");
 const dir=mkdtempSync(join(tmpdir(),"findjoy-payment-test-"));
 writeFileSync(join(dir,"merchant.pem"),keys.privateKey,{mode:0o600});
 writeFileSync(join(dir,"platform.json"),JSON.stringify({platform:keys.publicKey}));
 vi.stubEnv("XIAODOU_BASE_URL","https://api.example");vi.stubEnv("XIAODOU_APP_ID","merchant-app");vi.stubEnv("XIAODOU_KEY_ID","merchant-key");
 vi.stubEnv("XIAODOU_PRIVATE_KEY_FILE",join(dir,"merchant.pem"));vi.stubEnv("XIAODOU_PLATFORM_KEYS_FILE",join(dir,"platform.json"));
 let signed=true;
 vi.stubGlobal("fetch",vi.fn(async(_url:URL,init:RequestInit)=>{
  const requestHeaders=new Headers(init.headers);expect(requestHeaders.get("X-XD-Sign")).toBeTruthy();
  const requestId=requestHeaders.get("X-XD-Request-Id")!;
  const body=Buffer.from(JSON.stringify({requestId,status:"SUCCEEDED"}));
  const timestamp=Math.floor(Date.now()/1000).toString();
  const responseHeaders=new Headers({"Content-Type":"application/json; charset=utf-8","X-XD-Request-Id":requestId});
  if(signed){
   responseHeaders.set("X-XD-Response-Key-Id","platform");responseHeaders.set("X-XD-Response-Timestamp",timestamp);responseHeaders.set("X-XD-Response-Nonce","nonce");
   responseHeaders.set("X-XD-Response-Sign",sign("RSA-SHA256",Buffer.from(responseSigningString(200,"application/json",requestId,timestamp,"nonce","platform",body)),keys.privateKey).toString("base64"));
  }
  return new Response(body,{status:200,headers:responseHeaders});
 }));
 try{
  expect((await xiaodouRequest("GET","/api/open/v1/payments/our-order")).status).toBe("SUCCEEDED");
  signed=false;await expect(xiaodouRequest("GET","/api/open/v1/payments/our-order")).rejects.toThrow("缺少签名");
 }finally{vi.unstubAllGlobals();vi.unstubAllEnvs();rmSync(dir,{recursive:true,force:true});}
});
