import { randomUUID } from "node:crypto";
import { lifeStore } from "./life-store";
import { query, withTransaction } from "./database";
import type { LifeState } from "./life";
import type { TranscriptMessage } from "./model-adapter";

import { NORMAL_LIFE_POINTS } from "./points";

export interface Product { id: string; name: string; credits: number; amountFen: number; demo: boolean }
export type PayChannel = "ALIPAY_H5" | "WECHAT_H5";
export interface JoyOrder {
  id: string; userId: string; productId: string; name: string; credits: number; amountFen: number;
  demo: number; channel: PayChannel; status: string; requestId: string; requestBody: string | null;
  payUrl: string | null; expiresAt: string | null; createdAt: number; platformId: string | null;
}
export interface LifeOperation { id: string; userId: string; lifeId: string; requestHash: string; status: "pending" | "complete" | "failed"; expiresAt: number; cost: number }

const ORDER_SELECT = `SELECT id,user_id AS "userId",product_id AS "productId",name,credits,amount_fen AS "amountFen",
 demo,channel,status,request_id AS "requestId",request_body AS "requestBody",pay_url AS "payUrl",
 expires_at AS "expiresAt",created_at::float8 AS "createdAt",platform_id AS "platformId" FROM joy_orders`;
const OP_SELECT = `SELECT id,user_id AS "userId",life_id AS "lifeId",request_hash AS "requestHash",status,
 expires_at::float8 AS "expiresAt",cost_points AS cost FROM joy_life_operations`;
export class CommerceError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}
async function lockUser(userId: string) {
  await query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", [`credits:${userId}`]);
}
export const commerceStore = {
  async balance(userId: string): Promise<{available:number;held:number}> {
    return (await query<{available:number;held:number}>("SELECT available,held FROM joy_accounts WHERE user_id=$1", [userId])).rows[0] ?? {available:0,held:0};
  },
  async ledger(userId: string): Promise<Array<{delta:number;reason:string;reference:string;createdAt:number}>> {
    return (await query<{delta:number;reason:string;reference:string;createdAt:number}>('SELECT delta,reason,reference,created_at::float8 AS "createdAt" FROM joy_ledger WHERE user_id=$1 ORDER BY id', [userId])).rows;
  },
  async grantTrial(userId: string, credits: number): Promise<void> {
    if (!Number.isSafeInteger(credits) || credits<0 || credits>100) throw new Error("赠送积分配置无效");
    await withTransaction(async () => {
      await lockUser(userId);
      await query("INSERT INTO joy_accounts(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [userId]);
      const added = await query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ($1,$2,'trial',$1,$3) ON CONFLICT(reason,reference) DO NOTHING", [userId,credits,Date.now()]);
      if (added.rowCount) await query("UPDATE joy_accounts SET available=available+$1 WHERE user_id=$2", [credits,userId]);
    });
  },
  async createOrder(userId: string, product: Product, key: string, channel: PayChannel): Promise<JoyOrder> {
    if (!key || key.length>128 || !Number.isSafeInteger(product.credits) || product.credits<1 || !Number.isSafeInteger(product.amountFen) || product.amountFen<1) throw new CommerceError("INVALID_ORDER","订单参数无效",400);
    return withTransaction(async () => {
      await lockUser(userId);
      const previous = (await query<JoyOrder>(`${ORDER_SELECT} WHERE user_id=$1 AND idempotency_key=$2`, [userId,key])).rows[0];
      if (previous) {
        if(previous.productId!==product.id || previous.amountFen!==product.amountFen || previous.credits!==product.credits || Boolean(previous.demo)!==product.demo || previous.channel!==channel) throw new CommerceError("IDEMPOTENCY_CONFLICT","重复请求参数不一致");
        return previous;
      }
      const id = `joy_${randomUUID().replaceAll("-","")}`;
      await query("INSERT INTO joy_orders(id,user_id,product_id,name,credits,amount_fen,demo,channel,request_id,created_at,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [id,userId,product.id,product.name,product.credits,product.amountFen,Number(product.demo),channel,randomUUID(),Date.now(),key]);
      return (await commerceStore.getOrder(id,userId))!;
    });
  },
  async getOrder(id: string,userId: string): Promise<JoyOrder|null> {
    return (await query<JoyOrder>(`${ORDER_SELECT} WHERE id=$1 AND user_id=$2`, [id,userId])).rows[0] ?? null;
  },
  async listOrders(userId: string): Promise<JoyOrder[]> {
    return (await query<JoyOrder>(`${ORDER_SELECT} WHERE user_id=$1 ORDER BY created_at DESC LIMIT 100`, [userId])).rows;
  },
  async claimQuery(id: string,now=Date.now()): Promise<boolean> {
    return (await query(`INSERT INTO joy_order_checks VALUES ($1,$2) ON CONFLICT(order_id) DO UPDATE
      SET checked_at=excluded.checked_at WHERE joy_order_checks.checked_at<=$3`, [id,now,now-4500])).rowCount===1;
  },
  async outstandingOrders(now=Date.now()): Promise<JoyOrder[]> {
    return (await query<JoyOrder>(`${ORDER_SELECT} WHERE demo=0 AND status!='SUCCEEDED' AND created_at>$1
      ORDER BY COALESCE((SELECT checked_at FROM joy_order_checks WHERE order_id=joy_orders.id),0) LIMIT 10`, [now-30*24*60*60*1000])).rows;
  },
  async pendingAttemptRequestId(id: string): Promise<string|null> {
    return (await query("SELECT request_id FROM joy_payment_attempts WHERE order_id=$1", [id])).rows[0]?.request_id ?? null;
  },
  async attemptRequestId(id: string): Promise<string> {
    await query("INSERT INTO joy_payment_attempts VALUES ($1,$2) ON CONFLICT DO NOTHING", [id,randomUUID()]);
    return (await commerceStore.pendingAttemptRequestId(id))!;
  },
  async finishAttempt(id: string): Promise<void> { await query("DELETE FROM joy_payment_attempts WHERE order_id=$1", [id]); },
  async saveOrderRequest(id: string,body: string): Promise<string> {
    const row = (await query("UPDATE joy_orders SET request_body=COALESCE(request_body,$1) WHERE id=$2 RETURNING request_body", [body,id])).rows[0];
    if (!row) throw new Error("订单不存在");
    return row.request_body;
  },
  async savePaymentMaterial(id: string,payUrl: string,expiresAt: string): Promise<void> {
    await query("UPDATE joy_orders SET pay_url=$1,expires_at=$2 WHERE id=$3 AND status!='SUCCEEDED'", [payUrl,expiresAt,id]);
  },
  async setOrderStatus(id: string,status: string): Promise<void> {
    if (!["CREATED","PAYING","UNKNOWN","CLOSED","FAILED"].includes(status)) return;
    await query("UPDATE joy_orders SET status=$1 WHERE id=$2 AND status!='SUCCEEDED'", [status,id]);
  },
  async confirmDemo(id: string,userId: string): Promise<void> {
    await query("UPDATE joy_orders SET status='DEMO_COMPLETE' WHERE id=$1 AND user_id=$2 AND demo=1", [id,userId]);
  },
  async confirmPaid(id: string,amountFen: number,platformId: string,eventId?: string): Promise<void> {
    await withTransaction(async () => {
      const order = (await query<JoyOrder>(`${ORDER_SELECT} WHERE id=$1 FOR UPDATE`, [id])).rows[0];
      if (!order || order.demo || order.amountFen!==amountFen || !platformId) throw new Error("支付订单核对失败");
      if (order.platformId && order.platformId!==platformId) throw new Error("支付交易标识不一致");
      if (eventId) {
        await query("INSERT INTO joy_payment_events VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", [eventId,id,Date.now()]);
        const event = (await query("SELECT order_id FROM joy_payment_events WHERE event_id=$1", [eventId])).rows[0];
        if (event.order_id!==id) throw new Error("事件归属不一致");
      }
      if (order.status==="SUCCEEDED") return;
      await query("INSERT INTO joy_accounts(user_id) VALUES ($1) ON CONFLICT DO NOTHING", [order.userId]);
      await query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ($1,$2,'purchase',$3,$4)", [order.userId,order.credits,id,Date.now()]);
      await query("UPDATE joy_accounts SET available=available+$1 WHERE user_id=$2", [order.credits,order.userId]);
      await query("UPDATE joy_orders SET status='SUCCEEDED',platform_id=$1,pay_url=NULL WHERE id=$2", [platformId,id]);
    });
  },
  async beginLife(userId: string,key: string,requestHash: string,life: LifeState,now=Date.now()): Promise<LifeOperation> {
    await commerceStore.expireOperations(now);
    return withTransaction(async () => {
      await lockUser(userId);
      const previous = (await query<LifeOperation>(`${OP_SELECT} WHERE user_id=$1 AND idempotency_key=$2`, [userId,key])).rows[0];
      if (previous) {
        if(previous.requestHash!==requestHash) throw new CommerceError("IDEMPOTENCY_CONFLICT","重复请求参数不一致");
        return previous;
      }
      const debit = await query("UPDATE joy_accounts SET available=available-$1,held=held+$1 WHERE user_id=$2 AND available>=$1", [NORMAL_LIFE_POINTS,userId]);
      if (!debit.rowCount) throw new CommerceError("INSUFFICIENT_CREDITS","积分不足，请先充值积分",402);
      const id=randomUUID(), expiresAt=now+600000;
      await lifeStore.set(life,userId);
      await query("INSERT INTO joy_life_operations VALUES ($1,$2,$3,$4,$5,'pending',$6,$7)", [id,userId,life.lifeId,key,requestHash,expiresAt,NORMAL_LIFE_POINTS]);
      return {id,userId,lifeId:life.lifeId,requestHash,status:"pending" as const,expiresAt,cost:NORMAL_LIFE_POINTS};
    });
  },
  async findOperation(userId: string,key: string,requestHash: string): Promise<LifeOperation|null> {
    const op=(await query<LifeOperation>(`${OP_SELECT} WHERE user_id=$1 AND idempotency_key=$2`, [userId,key])).rows[0];
    if (op && op.requestHash!==requestHash) throw new CommerceError("IDEMPOTENCY_CONFLICT","重复请求参数不一致");
    return op ?? null;
  },
  async getOperation(id: string,userId: string): Promise<LifeOperation|null> {
    return (await query<LifeOperation>(`${OP_SELECT} WHERE id=$1 AND user_id=$2`, [id,userId])).rows[0] ?? null;
  },
  async completeLife(id: string,userId: string,life: LifeState,transcript: TranscriptMessage[],now=Date.now()): Promise<void> {
    await withTransaction(async () => {
      const op = (await query<LifeOperation>(`${OP_SELECT} WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id,userId])).rows[0];
      if (!op || op.status!=="pending" || op.expiresAt<=now || op.lifeId!==life.lifeId) throw new CommerceError("OPERATION_EXPIRED","开局已过期，请重新开始");
      await lifeStore.set(life,userId); await lifeStore.setTranscript(life.lifeId,transcript);
      await query("UPDATE joy_accounts SET held=held-$1 WHERE user_id=$2", [op.cost,userId]);
      await query("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES ($1,$2,'life',$3,$4)", [userId,-op.cost,id,now]);
      await query("UPDATE joy_life_operations SET status='complete' WHERE id=$1", [id]);
    });
  },
  async failLife(id: string,userId: string): Promise<void> {
    await withTransaction(async () => {
      const op = (await query<LifeOperation>(`${OP_SELECT} WHERE id=$1 AND user_id=$2 FOR UPDATE`, [id,userId])).rows[0];
      if (!op || op.status!=="pending") return;
      await query("UPDATE joy_accounts SET available=available+$1,held=held-$1 WHERE user_id=$2", [op.cost,userId]);
      await query("UPDATE joy_life_operations SET status='failed' WHERE id=$1", [id]);
      await lifeStore.delete(op.lifeId);
    });
  },
  async expireOperations(now=Date.now()): Promise<void> {
    const expired = (await query<{id:string;userId:string}>(`SELECT id,user_id AS "userId" FROM joy_life_operations WHERE status='pending' AND expires_at<=$1 ORDER BY expires_at LIMIT 50`, [now])).rows;
    for (const op of expired) await commerceStore.failLife(op.id,op.userId);
  },
};
