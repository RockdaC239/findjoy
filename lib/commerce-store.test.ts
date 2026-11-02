import { setupTestPostgres } from "./test-postgres";
setupTestPostgres();
import { afterEach, describe, expect, it } from "vitest";
import { commerceStore } from "./commerce-store";
import { identityStore } from "./identity-store";
import { lifeStore } from "./life-store";
import { createStarterLife } from "./life";

afterEach(async () => (await lifeStore.close()));
const user = async () => (await identityStore.resolveUser("https://auth.example", "alice")).id;
const product = {id:"starter",name:"体验包",credits:3,amountFen:790,demo:false};

describe("FindJoy order and credit transactions", () => {
  it("grants a paid order once despite duplicate events, rejects price mismatch and another owner's access", async () => {
    const id=await user(); const order=await commerceStore.createOrder(id,product,"buy-once","ALIPAY_H5");
    expect((await commerceStore.createOrder(id,product,"buy-once","ALIPAY_H5")).id).toBe(order.id);
    expect(await commerceStore.getOrder(order.id,"bob")).toBeNull();
    await expect(async ()=>(await commerceStore.confirmPaid(order.id,791,"platform-1","event-1"))).rejects.toThrow();
    expect(await commerceStore.balance(id)).toEqual({available:0,held:0});
    await commerceStore.confirmPaid(order.id,790,"platform-1","event-1");
    await commerceStore.confirmPaid(order.id,790,"platform-1","event-1");
    await commerceStore.confirmPaid(order.id,790,"platform-1","event-2");
    expect(await commerceStore.balance(id)).toEqual({available:3,held:0});
    expect(await commerceStore.ledger(id)).toHaveLength(1);
    await expect(async ()=>(await commerceStore.createOrder(id,{...product,credits:9},"buy-once","ALIPAY_H5"))).rejects.toThrow();
  });
  it("does not grant real credits for demo purchases", async () => {
    const id=await user();const order=await commerceStore.createOrder(id,{...product,demo:true},"demo","ALIPAY_H5");
    await expect(async ()=>(await commerceStore.confirmPaid(order.id,790,"platform-1","event-1"))).rejects.toThrow();
    expect((await commerceStore.balance(id)).available).toBe(0);
  });
  it("reserves atomically, replays starts, releases failures and prevents a late completion", async () => {
    const id=await user();await commerceStore.grantTrial(id,20);await commerceStore.grantTrial(id,20);
    const life=createStarterLife();const op=await commerceStore.beginLife(id,"start-once","hash",life,1000);
    expect((await commerceStore.beginLife(id,"start-once","hash",createStarterLife(),1001)).id).toBe(op.id);
    await expect(async ()=>(await commerceStore.beginLife(id,"start-other","hash",createStarterLife(),1002))).rejects.toThrow();
    expect(await commerceStore.balance(id)).toEqual({available:0,held:20});
    await commerceStore.failLife(op.id,id);
    expect(await commerceStore.balance(id)).toEqual({available:20,held:0});
    await expect(async ()=>(await commerceStore.completeLife(op.id,id,life,[]))).rejects.toThrow();
  });
  it("commits the opening, transcript and consumption together and recovers expired holds", async () => {
    const id=await user();await commerceStore.grantTrial(id,40);
    const life=createStarterLife();const op=await commerceStore.beginLife(id,"start-once","hash",life,1000);
    await commerceStore.completeLife(op.id,id,life,[{role:"user",content:"opening"}],2000);
    expect(await commerceStore.balance(id)).toEqual({available:20,held:0});
    expect(await lifeStore.getTranscript(life.lifeId)).toHaveLength(1);
    const second=await commerceStore.beginLife(id,"second","hash",createStarterLife(),3000);
    await commerceStore.expireOperations(700000);
    expect((await commerceStore.getOperation(second.id,id))?.status).toBe("failed");
    expect(await commerceStore.balance(id)).toEqual({available:20,held:0});
    expect((await commerceStore.ledger(id)).map(item=>item.delta)).toEqual([40,-20]);
  });
});

it("grants a new user 100 points once and spends 20 for a completed normal life",async ()=>{
 const id=await user();await commerceStore.grantTrial(id,100);await commerceStore.grantTrial(id,100);
 const life=createStarterLife();const op=await commerceStore.beginLife(id,"points-start","hash",life);
 expect(await commerceStore.balance(id)).toEqual({available:80,held:20});
 await commerceStore.completeLife(op.id,id,life,[]);
 expect(await commerceStore.balance(id)).toEqual({available:80,held:0});
 expect((await commerceStore.ledger(id)).map(e=>e.delta)).toEqual([100,-20]);
});

it("never converts current points during requests even when an old marker is absent", async () => {
 const id=await user();await commerceStore.grantTrial(id,40);
 const life=createStarterLife();const op=await commerceStore.beginLife(id,"hold","hash",life);
 expect(await commerceStore.balance(id)).toEqual({available:20,held:20});
 await commerceStore.failLife(op.id,id);await commerceStore.failLife(op.id,id);
 expect(await commerceStore.balance(id)).toEqual({available:40,held:0});
});
