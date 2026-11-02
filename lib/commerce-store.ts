import { randomUUID } from "node:crypto";
import { getDb, lifeStore } from "./life-store";
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

function database() {
  const db = getDb();
  db.exec(`
    CREATE TABLE IF NOT EXISTS joy_accounts (user_id TEXT PRIMARY KEY, available INTEGER NOT NULL DEFAULT 0 CHECK(available>=0), held INTEGER NOT NULL DEFAULT 0 CHECK(held>=0));
    CREATE TABLE IF NOT EXISTS joy_ledger (id INTEGER PRIMARY KEY, user_id TEXT NOT NULL, delta INTEGER NOT NULL, reason TEXT NOT NULL, reference TEXT NOT NULL, created_at INTEGER NOT NULL, UNIQUE(reason, reference));
    CREATE TABLE IF NOT EXISTS joy_orders (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, product_id TEXT NOT NULL, name TEXT NOT NULL,
      credits INTEGER NOT NULL, amount_fen INTEGER NOT NULL, demo INTEGER NOT NULL, channel TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'CREATED', request_id TEXT NOT NULL, request_body TEXT,
      pay_url TEXT, expires_at TEXT, created_at INTEGER NOT NULL, platform_id TEXT UNIQUE,
      idempotency_key TEXT NOT NULL, UNIQUE(user_id,idempotency_key)
    );
    CREATE INDEX IF NOT EXISTS joy_orders_user ON joy_orders(user_id, created_at);
    CREATE TABLE IF NOT EXISTS joy_order_checks(order_id TEXT PRIMARY KEY,checked_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS joy_payment_attempts(order_id TEXT PRIMARY KEY, request_id TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS joy_payment_events (event_id TEXT PRIMARY KEY, order_id TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS joy_life_operations (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL, life_id TEXT NOT NULL,
      idempotency_key TEXT NOT NULL, request_hash TEXT NOT NULL, status TEXT NOT NULL,
      expires_at INTEGER NOT NULL, UNIQUE(user_id,idempotency_key)
    );
  `);
  const columns = db.prepare("PRAGMA table_info(joy_life_operations)").all() as Array<{name:string}>;
  if (!columns.some(column=>column.name==="cost_points")) db.exec("ALTER TABLE joy_life_operations ADD COLUMN cost_points INTEGER NOT NULL DEFAULT 20");
  db.exec("CREATE TABLE IF NOT EXISTS joy_migrations (name TEXT PRIMARY KEY)");
  db.transaction(()=>{
    const applied=db.prepare("INSERT OR IGNORE INTO joy_migrations VALUES ('points-v1')").run();
    if(applied.changes){
      // 旧权益一局折算 20 积分；订单金额和支付请求保持原样。
      db.exec("UPDATE joy_accounts SET available=available*20,held=held*20; UPDATE joy_ledger SET delta=delta*20; UPDATE joy_orders SET credits=credits*20;");
    }
  }).immediate();
  return db;
}

const ORDER_SELECT = `SELECT id, user_id AS userId, product_id AS productId, name, credits, amount_fen AS amountFen,
 demo, channel, status, request_id AS requestId, request_body AS requestBody, pay_url AS payUrl,
 expires_at AS expiresAt, created_at AS createdAt, platform_id AS platformId FROM joy_orders`;
const OP_SELECT = `SELECT id,user_id AS userId,life_id AS lifeId,request_hash AS requestHash,status,expires_at AS expiresAt,cost_points AS cost FROM joy_life_operations`;

export class CommerceError extends Error {
  constructor(public code: string, message: string, public status = 409) { super(message); }
}

export const commerceStore = {
  balance(userId: string): { available: number; held: number } {
    return database().prepare("SELECT available,held FROM joy_accounts WHERE user_id=?").get(userId) as {available:number;held:number} | undefined ?? {available:0,held:0};
  },
  ledger(userId: string) {
    return database().prepare("SELECT delta,reason,reference,created_at AS createdAt FROM joy_ledger WHERE user_id=? ORDER BY id").all(userId) as Array<{delta:number;reason:string;reference:string;createdAt:number}>;
  },
  grantTrial(userId: string, credits: number): void {
    if (!Number.isSafeInteger(credits) || credits < 0 || credits > 100) throw new Error("赠送积分配置无效");
    const db=database();
    db.transaction(()=>{
      db.prepare("INSERT OR IGNORE INTO joy_accounts(user_id) VALUES (?)").run(userId);
      const added=db.prepare("INSERT OR IGNORE INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES (?,?,'trial',?,?)").run(userId,credits,userId,Date.now());
      if(added.changes)db.prepare("UPDATE joy_accounts SET available=available+? WHERE user_id=?").run(credits,userId);
    }).immediate();
  },
  createOrder(userId: string, product: Product, key: string, channel: PayChannel): JoyOrder {
    if(!key || key.length>128 || !Number.isSafeInteger(product.credits) || product.credits<1 || !Number.isSafeInteger(product.amountFen) || product.amountFen<1) throw new CommerceError("INVALID_ORDER","订单参数无效",400);
    const db=database();
    return db.transaction(()=>{
      const previous=db.prepare(`${ORDER_SELECT} WHERE user_id=? AND idempotency_key=?`).get(userId,key) as JoyOrder|undefined;
      if(previous){
        if(previous.productId!==product.id || previous.amountFen!==product.amountFen || previous.credits!==product.credits || Boolean(previous.demo)!==product.demo || previous.channel!==channel)throw new CommerceError("IDEMPOTENCY_CONFLICT","重复请求参数不一致");
        return previous;
      }
      const id=`joy_${randomUUID().replaceAll("-","")}`;
      db.prepare("INSERT INTO joy_orders(id,user_id,product_id,name,credits,amount_fen,demo,channel,request_id,created_at,idempotency_key) VALUES (?,?,?,?,?,?,?,?,?,?,?)")
        .run(id,userId,product.id,product.name,product.credits,product.amountFen,Number(product.demo),channel,randomUUID(),Date.now(),key);
      return commerceStore.getOrder(id,userId)!;
    }).immediate();
  },
  getOrder(id: string, userId: string): JoyOrder|null {
    return database().prepare(`${ORDER_SELECT} WHERE id=? AND user_id=?`).get(id,userId) as JoyOrder|undefined ?? null;
  },
  listOrders(userId: string): JoyOrder[] {
    return database().prepare(`${ORDER_SELECT} WHERE user_id=? ORDER BY created_at DESC LIMIT 100`).all(userId) as JoyOrder[];
  },
  claimQuery(id:string,now=Date.now()):boolean {
    return database().prepare(`INSERT INTO joy_order_checks VALUES (?,?) ON CONFLICT(order_id) DO UPDATE SET checked_at=excluded.checked_at WHERE joy_order_checks.checked_at<=?`).run(id,now,now-4500).changes===1;
  },
  outstandingOrders(now=Date.now()):JoyOrder[] {
    const ids=database().prepare(`SELECT o.id,o.user_id AS userId FROM joy_orders o LEFT JOIN joy_order_checks c ON c.order_id=o.id
      WHERE o.demo=0 AND o.status!='SUCCEEDED' AND o.created_at>? ORDER BY COALESCE(c.checked_at,0) ASC LIMIT 10`).all(now-30*24*60*60*1000) as Array<{id:string;userId:string}>;
    return ids.map(row=>commerceStore.getOrder(row.id,row.userId)!);
  },
  pendingAttemptRequestId(id:string):string|null {
    return (database().prepare("SELECT request_id FROM joy_payment_attempts WHERE order_id=?").get(id) as {request_id:string}|undefined)?.request_id??null;
  },
  attemptRequestId(id:string):string {
    const db=database();
    db.prepare("INSERT OR IGNORE INTO joy_payment_attempts VALUES (?,?)").run(id,randomUUID());
    return (db.prepare("SELECT request_id FROM joy_payment_attempts WHERE order_id=?").get(id) as {request_id:string}).request_id;
  },
  finishAttempt(id:string):void {database().prepare("DELETE FROM joy_payment_attempts WHERE order_id=?").run(id);},
  saveOrderRequest(id: string, body: string): string {
    const db=database();
    db.prepare("UPDATE joy_orders SET request_body=COALESCE(request_body,?) WHERE id=?").run(body,id);
    return (db.prepare("SELECT request_body FROM joy_orders WHERE id=?").get(id) as {request_body:string}).request_body;
  },
  savePaymentMaterial(id: string, payUrl: string, expiresAt: string): void {
    database().prepare("UPDATE joy_orders SET pay_url=?,expires_at=? WHERE id=? AND status!='SUCCEEDED'").run(payUrl,expiresAt,id);
  },
  setOrderStatus(id: string, status: string): void {
    if(!["CREATED","PAYING","UNKNOWN","CLOSED","FAILED"].includes(status))return;
    database().prepare("UPDATE joy_orders SET status=? WHERE id=? AND status!='SUCCEEDED'").run(status,id);
  },
  confirmDemo(id: string, userId: string): void {
    database().prepare("UPDATE joy_orders SET status='DEMO_COMPLETE' WHERE id=? AND user_id=? AND demo=1").run(id,userId);
  },
  confirmPaid(id: string, amountFen: number, platformId: string, eventId?: string): void {
    const db=database();
    db.transaction(()=>{
      const order=db.prepare(`${ORDER_SELECT} WHERE id=?`).get(id) as JoyOrder|undefined;
      if(!order || order.demo || order.amountFen!==amountFen || !platformId)throw new Error("支付订单核对失败");
      if(order.platformId && order.platformId!==platformId)throw new Error("支付交易标识不一致");
      if(eventId){
        const event=db.prepare("SELECT order_id FROM joy_payment_events WHERE event_id=?").get(eventId) as {order_id:string}|undefined;
        if(event){if(event.order_id!==id)throw new Error("事件归属不一致");return;}
        db.prepare("INSERT INTO joy_payment_events VALUES (?,?,?)").run(eventId,id,Date.now());
      }
      if(order.status==="SUCCEEDED")return;
      db.prepare("INSERT OR IGNORE INTO joy_accounts(user_id) VALUES (?)").run(order.userId);
      db.prepare("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES (?,?,'purchase',?,?)").run(order.userId,order.credits,id,Date.now());
      db.prepare("UPDATE joy_accounts SET available=available+? WHERE user_id=?").run(order.credits,order.userId);
      db.prepare("UPDATE joy_orders SET status='SUCCEEDED',platform_id=?,pay_url=NULL WHERE id=?").run(platformId,id);
    }).immediate();
  },
  beginLife(userId: string, key: string, requestHash: string, life: LifeState, now=Date.now()): LifeOperation {
    const db=database();
    return db.transaction(()=>{
      commerceStore.expireOperations(now);
      const previous=db.prepare(`${OP_SELECT} WHERE user_id=? AND idempotency_key=?`).get(userId,key) as LifeOperation|undefined;
      if(previous){if(previous.requestHash!==requestHash)throw new CommerceError("IDEMPOTENCY_CONFLICT","重复请求参数不一致");return previous;}
      const debit=db.prepare("UPDATE joy_accounts SET available=available-?,held=held+? WHERE user_id=? AND available>=?").run(NORMAL_LIFE_POINTS,NORMAL_LIFE_POINTS,userId,NORMAL_LIFE_POINTS);
      if(!debit.changes)throw new CommerceError("INSUFFICIENT_CREDITS","积分不足，请先充值积分",402);
      const id=randomUUID();const expiresAt=now+10*60*1000;
      lifeStore.set(life,userId);
      db.prepare("INSERT INTO joy_life_operations(id,user_id,life_id,idempotency_key,request_hash,status,expires_at,cost_points) VALUES (?,?,?,?,?,'pending',?,?)").run(id,userId,life.lifeId,key,requestHash,expiresAt,NORMAL_LIFE_POINTS);
      return {id,userId,lifeId:life.lifeId,requestHash,status:"pending" as const,expiresAt,cost:NORMAL_LIFE_POINTS};
    }).immediate();
  },
  getOperation(id: string,userId: string): LifeOperation|null {
    return database().prepare(`${OP_SELECT} WHERE id=? AND user_id=?`).get(id,userId) as LifeOperation|undefined ?? null;
  },
  completeLife(id: string,userId: string,life: LifeState,transcript: TranscriptMessage[],now=Date.now()):void {
    const db=database();
    db.transaction(()=>{
      const op=commerceStore.getOperation(id,userId);
      if(!op || op.status!=="pending" || op.expiresAt<=now || op.lifeId!==life.lifeId)throw new CommerceError("OPERATION_EXPIRED","开局已过期，请重新开始");
      lifeStore.set(life,userId);lifeStore.setTranscript(life.lifeId,transcript);
      db.prepare("UPDATE joy_accounts SET held=held-? WHERE user_id=?").run(op.cost,userId);
      db.prepare("INSERT INTO joy_ledger(user_id,delta,reason,reference,created_at) VALUES (?,?,'life',?,?)").run(userId,-op.cost,id,now);
      db.prepare("UPDATE joy_life_operations SET status='complete' WHERE id=?").run(id);
    }).immediate();
  },
  failLife(id: string,userId: string):void {
    const db=database();
    db.transaction(()=>{
      const op=commerceStore.getOperation(id,userId);
      if(!op || op.status!=="pending")return;
      db.prepare("UPDATE joy_accounts SET available=available+?,held=held-? WHERE user_id=?").run(op.cost,op.cost,userId);
      db.prepare("UPDATE joy_life_operations SET status='failed' WHERE id=?").run(id);
      lifeStore.delete(op.lifeId);
    }).immediate();
  },
  expireOperations(now=Date.now()):void {
    const expired=database().prepare("SELECT id,user_id AS userId FROM joy_life_operations WHERE status='pending' AND expires_at<=?").all(now) as Array<{id:string;userId:string}>;
    for(const op of expired)commerceStore.failLife(op.id,op.userId);
  },
};
