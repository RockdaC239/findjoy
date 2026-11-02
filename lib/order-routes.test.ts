import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({currentUser:vi.fn()}));
vi.mock("./auth",()=>({currentUser:mocks.currentUser,appOrigin:()=>"https://findfire.club"}));
import {POST as createOrder} from "../app/api/orders/route";
import {POST as retryPayment} from "../app/api/orders/[id]/retry/route";
import {GET as orderStatus} from "../app/api/orders/[id]/route";
import {POST as demoConfirm} from "../app/api/orders/[id]/demo/route";
import {lifeStore} from "./life-store";
import {identityStore} from "./identity-store";
import {commerceStore} from "./commerce-store";
beforeEach(async ()=>{await lifeStore.close();mocks.currentUser.mockResolvedValue(null);vi.stubEnv("FINDJOY_PAYMENTS_MODE","demo");});
describe("order API ownership and authoritative pricing",()=>{
 it("rejects oversized, malformed and non-object bodies before creating an order",async()=>{
  const id=(await identityStore.resolveUser("https://auth.example","body-limits")).id;mocks.currentUser.mockResolvedValue({id});
  const headers={origin:"https://findfire.club","Content-Type":"application/json","Idempotency-Key":"body-limit"};
  const oversized=new Request("https://findfire.club/findjoy/api/orders",{method:"POST",headers,body:JSON.stringify({productId:"light",channel:"WECHAT_H5",padding:"x".repeat(9000)})});
  const tooLarge=await createOrder(oversized);expect(tooLarge.status).toBe(413);expect((await tooLarge.json()).code).toBe("BODY_TOO_LARGE");
  const malformed=await createOrder(new Request("https://findfire.club/findjoy/api/orders",{method:"POST",headers,body:"{"}));
  expect(malformed.status).toBe(400);expect((await malformed.json()).code).toBe("INVALID_BODY");
  const array=await createOrder(new Request("https://findfire.club/findjoy/api/orders",{method:"POST",headers,body:"[]"}));
  expect(array.status).toBe(400);
  expect(await commerceStore.listOrders(id)).toHaveLength(0);
 });
 it("returns a retryable 503 instead of an unhandled error when the database is unavailable",async()=>{
  mocks.currentUser.mockRejectedValueOnce(Object.assign(new Error("password=secret"),{code:"57P03"}));
  const response=await createOrder(new Request("https://findfire.club/findjoy/api/orders",{method:"POST"}));
  expect(response.status).toBe(503);expect(response.headers.get("retry-after")).toBe("5");
  expect(JSON.stringify(await response.json())).not.toContain("secret");
 });
 it("requires login and rejects cross-site writes",async()=>{
  const req=new Request("https://findfire.club/findjoy/api/orders",{method:"POST"});
  expect((await createOrder(req)).status).toBe(401);
  mocks.currentUser.mockResolvedValue({id:"alice"});
  expect((await createOrder(req)).status).toBe(403);
 });
 it("ignores client prices, replays a purchase once, and isolates demo confirmation",async()=>{
  const id=(await identityStore.resolveUser("https://auth.example","alice")).id;mocks.currentUser.mockResolvedValue({id});
  const request=()=>new Request("https://findfire.club/findjoy/api/orders",{method:"POST",headers:{origin:"https://findfire.club","Content-Type":"application/json","Idempotency-Key":"buy"},body:JSON.stringify({productId:"light",channel:"WECHAT_H5",amountFen:1,credits:999})});
  const first=await(await createOrder(request())).json();
  const second=await(await createOrder(request())).json();
  expect(first.order.id).toBe(second.order.id);expect(first.order.amountFen).toBe(990);expect(first.order.credits).toBe(100);
  mocks.currentUser.mockResolvedValue({id:"bob"});
  const params={params:Promise.resolve({id:first.order.id})};
  expect((await orderStatus(new Request("https://findfire.club"),params)).status).toBe(404);
  expect((await demoConfirm(new Request("https://findfire.club",{method:"POST",headers:{origin:"https://findfire.club"}}),params)).status).toBe(404);
  expect((await commerceStore.balance(id)).available).toBe(0);
 });
});


it("rejects Alipay before creating a new order or retrying an existing payment",async()=>{
 const id=(await identityStore.resolveUser("https://auth.example","wechat-only")).id;mocks.currentUser.mockResolvedValue({id});
 const request=new Request("https://findfire.club/findjoy/api/orders",{method:"POST",headers:{origin:"https://findfire.club","Content-Type":"application/json","Idempotency-Key":"alipay-disabled"},body:JSON.stringify({productId:"light",channel:"ALIPAY_H5"})});
 expect((await createOrder(request)).status).toBe(400);expect(await commerceStore.listOrders(id)).toHaveLength(0);
 const old=await commerceStore.createOrder(id,{id:"old",name:"旧支付宝订单",credits:1,amountFen:1,demo:false},"old-alipay","ALIPAY_H5");
 const retry=new Request("https://findfire.club/findjoy/api/orders/old/retry",{method:"POST",headers:{origin:"https://findfire.club"}});
 expect((await retryPayment(retry,{params:Promise.resolve({id:old.id})})).status).toBe(400);
});
