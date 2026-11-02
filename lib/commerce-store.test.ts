import { afterEach, describe, expect, it } from "vitest";
import { commerceStore } from "./commerce-store";
import { identityStore } from "./identity-store";
import { getDb, lifeStore } from "./life-store";
import { createStarterLife } from "./life";

afterEach(() => lifeStore.close());
const user = () => identityStore.resolveUser("https://auth.example", "alice").id;
const product = {id:"starter",name:"体验包",credits:3,amountFen:790,demo:false};

describe("FindJoy order and credit transactions", () => {
  it("grants a paid order once despite duplicate events, rejects price mismatch and another owner's access", () => {
    const id=user(); const order=commerceStore.createOrder(id,product,"buy-once","ALIPAY_H5");
    expect(commerceStore.createOrder(id,product,"buy-once","ALIPAY_H5").id).toBe(order.id);
    expect(commerceStore.getOrder(order.id,"bob")).toBeNull();
    expect(()=>commerceStore.confirmPaid(order.id,791,"platform-1","event-1")).toThrow();
    expect(commerceStore.balance(id)).toEqual({available:0,held:0});
    commerceStore.confirmPaid(order.id,790,"platform-1","event-1");
    commerceStore.confirmPaid(order.id,790,"platform-1","event-1");
    commerceStore.confirmPaid(order.id,790,"platform-1","event-2");
    expect(commerceStore.balance(id)).toEqual({available:3,held:0});
    expect(commerceStore.ledger(id)).toHaveLength(1);
    expect(()=>commerceStore.createOrder(id,{...product,credits:9},"buy-once","ALIPAY_H5")).toThrow();
  });
  it("does not grant real credits for demo purchases", () => {
    const id=user();const order=commerceStore.createOrder(id,{...product,demo:true},"demo","ALIPAY_H5");
    expect(()=>commerceStore.confirmPaid(order.id,790,"platform-1","event-1")).toThrow();
    expect(commerceStore.balance(id).available).toBe(0);
  });
  it("reserves atomically, replays starts, releases failures and prevents a late completion", () => {
    const id=user();commerceStore.grantTrial(id,20);commerceStore.grantTrial(id,20);
    const life=createStarterLife();const op=commerceStore.beginLife(id,"start-once","hash",life,1000);
    expect(commerceStore.beginLife(id,"start-once","hash",createStarterLife(),1001).id).toBe(op.id);
    expect(()=>commerceStore.beginLife(id,"start-other","hash",createStarterLife(),1002)).toThrow();
    expect(commerceStore.balance(id)).toEqual({available:0,held:20});
    commerceStore.failLife(op.id,id);
    expect(commerceStore.balance(id)).toEqual({available:20,held:0});
    expect(()=>commerceStore.completeLife(op.id,id,life,[])).toThrow();
  });
  it("commits the opening, transcript and consumption together and recovers expired holds", () => {
    const id=user();commerceStore.grantTrial(id,40);
    const life=createStarterLife();const op=commerceStore.beginLife(id,"start-once","hash",life,1000);
    commerceStore.completeLife(op.id,id,life,[{role:"user",content:"opening"}],2000);
    expect(commerceStore.balance(id)).toEqual({available:20,held:0});
    expect(lifeStore.getTranscript(life.lifeId)).toHaveLength(1);
    const second=commerceStore.beginLife(id,"second","hash",createStarterLife(),3000);
    commerceStore.expireOperations(700000);
    expect(commerceStore.getOperation(second.id,id)?.status).toBe("failed");
    expect(commerceStore.balance(id)).toEqual({available:20,held:0});
    expect(commerceStore.ledger(id).map(item=>item.delta)).toEqual([40,-20]);
  });
});

it("converts legacy life credits and frozen orders to points exactly once",()=>{
 const id=user();commerceStore.grantTrial(id,1);
 const order=commerceStore.createOrder(id,{id:"legacy",name:"旧次卡",credits:1,amountFen:1,demo:false},"legacy","WECHAT_H5");commerceStore.confirmPaid(order.id,1,"legacy-payment");
 const db=getDb();db.prepare("DELETE FROM joy_migrations WHERE name='points-v1'").run();
 expect(commerceStore.balance(id)).toEqual({available:40,held:0});
 expect(commerceStore.balance(id)).toEqual({available:40,held:0});
 expect(commerceStore.getOrder(order.id,id)).toMatchObject({credits:20,amountFen:1,status:"SUCCEEDED"});
 expect(commerceStore.ledger(id).map(e=>e.delta)).toEqual([20,20]);
 commerceStore.grantTrial(id,100);expect(commerceStore.balance(id).available).toBe(40);
});

it("grants a new user 100 points once and spends 20 for a completed normal life",()=>{
 const id=user();commerceStore.grantTrial(id,100);commerceStore.grantTrial(id,100);
 const life=createStarterLife();const op=commerceStore.beginLife(id,"points-start","hash",life);
 expect(commerceStore.balance(id)).toEqual({available:80,held:20});
 commerceStore.completeLife(op.id,id,life,[]);
 expect(commerceStore.balance(id)).toEqual({available:80,held:0});
 expect(commerceStore.ledger(id).map(e=>e.delta)).toEqual([100,-20]);
});

it("converts an in-flight legacy hold and releases the same 20 points",()=>{
 const id=user();commerceStore.grantTrial(id,2);
 const life=createStarterLife();lifeStore.set(life,id);
 const db=getDb();db.prepare("UPDATE joy_accounts SET available=1,held=1 WHERE user_id=?").run(id);
 db.prepare("INSERT INTO joy_life_operations(id,user_id,life_id,idempotency_key,request_hash,status,expires_at,cost_points) VALUES (?,?,?,?,?,'pending',?,20)").run("legacy-hold",id,life.lifeId,"legacy-hold","hash",Date.now()+600000);
 db.prepare("DELETE FROM joy_migrations WHERE name='points-v1'").run();
 expect(commerceStore.balance(id)).toEqual({available:20,held:20});commerceStore.failLife("legacy-hold",id);
 expect(commerceStore.balance(id)).toEqual({available:40,held:0});commerceStore.failLife("legacy-hold",id);
 expect(commerceStore.balance(id)).toEqual({available:40,held:0});
});
