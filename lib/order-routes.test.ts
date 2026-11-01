import {beforeEach,describe,expect,it,vi} from "vitest";
const mocks=vi.hoisted(()=>({currentUser:vi.fn()}));
vi.mock("./auth",()=>({currentUser:mocks.currentUser,appOrigin:()=>"https://findfire.club"}));
import {POST as createOrder} from "../app/api/orders/route";
import {GET as orderStatus} from "../app/api/orders/[id]/route";
import {POST as demoConfirm} from "../app/api/orders/[id]/demo/route";
import {lifeStore} from "./life-store";
import {identityStore} from "./identity-store";
import {commerceStore} from "./commerce-store";
beforeEach(()=>{lifeStore.close();mocks.currentUser.mockResolvedValue(null);vi.stubEnv("FINDJOY_PAYMENTS_MODE","demo");});
describe("order API ownership and authoritative pricing",()=>{
 it("requires login and rejects cross-site writes",async()=>{
  const req=new Request("https://findfire.club/findjoy/api/orders",{method:"POST"});
  expect((await createOrder(req)).status).toBe(401);
  mocks.currentUser.mockResolvedValue({id:"alice"});
  expect((await createOrder(req)).status).toBe(403);
 });
 it("ignores client prices, replays a purchase once, and isolates demo confirmation",async()=>{
  const id=identityStore.resolveUser("https://auth.example","alice").id;mocks.currentUser.mockResolvedValue({id});
  const request=()=>new Request("https://findfire.club/findjoy/api/orders",{method:"POST",headers:{origin:"https://findfire.club","Content-Type":"application/json","Idempotency-Key":"buy"},body:JSON.stringify({productId:"one-life",channel:"ALIPAY_H5",amountFen:1,credits:999})});
  const first=await(await createOrder(request())).json();
  const second=await(await createOrder(request())).json();
  expect(first.order.id).toBe(second.order.id);expect(first.order.amountFen).toBe(990);expect(first.order.credits).toBe(1);
  mocks.currentUser.mockResolvedValue({id:"bob"});
  const params={params:Promise.resolve({id:first.order.id})};
  expect((await orderStatus(new Request("https://findfire.club"),params)).status).toBe(404);
  expect((await demoConfirm(new Request("https://findfire.club",{method:"POST",headers:{origin:"https://findfire.club"}}),params)).status).toBe(404);
  expect(commerceStore.balance(id).available).toBe(0);
 });
});
