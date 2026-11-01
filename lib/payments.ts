import { isIP } from "node:net";
import { appOrigin } from "./auth";
import { commerceStore, type JoyOrder } from "./commerce-store";
import { xiaodouConfig, xiaodouRequest, XiaodouError, verifyPlatformSignature, webhookSigningString } from "./xiaodou";

export function validatePayUrl(value: unknown): string {
  if(typeof value!=="string")throw new Error("支付链接缺失");
  const url=new URL(value);
  const origins=(process.env.XIAODOU_CASHIER_ORIGINS ?? "").split(",").filter(Boolean);
  if(url.protocol!=="https:" || url.username || url.password || !origins.includes(url.origin))throw new Error("支付链接来源无效");
  return value;
}

export function payerIp(request: Request): string {
  // nginx 必须覆盖 X-Real-IP；直连开发请求不满足真实支付风控条件。
  const ip=request.headers.get("x-real-ip") ?? "";
  if(!isIP(ip) || ip==="::1" || ip.startsWith("127.") || ip.startsWith("10.") || ip.startsWith("192.168.") || ip.startsWith("169.254.") || /^172\.(1[6-9]|2\d|3[01])\./.test(ip))throw new Error("真实支付需要可信网关提供买家公网 IP");
  return ip;
}

function confirmSnapshot(order: JoyOrder, snapshot: Record<string,unknown>): void {
  if(snapshot.outTradeNo!==order.id || snapshot.amountFen!==order.amountFen || snapshot.currency!=="CNY" || snapshot.channel!==order.channel)throw new Error("支付订单核对失败");
  if(snapshot.status==="SUCCEEDED")commerceStore.confirmPaid(order.id,order.amountFen,`${xiaodouConfig().appId}:${order.id}`);
  else if(typeof snapshot.status==="string")commerceStore.setOrderStatus(order.id,snapshot.status);
}

export async function createPayment(order: JoyOrder, request: Request): Promise<JoyOrder> {
  if(order.demo || order.status==="SUCCEEDED")return order;
  if(order.payUrl && order.expiresAt && Date.parse(order.expiresAt)>Date.now())return order;
  const body=commerceStore.saveOrderRequest(order.id,JSON.stringify({
    outTradeNo:order.id,channel:order.channel,tradeScope:"CARD_VIRTUAL",amountFen:order.amountFen,
    currency:"CNY",feeBearer:"SELLER",subject:`FindJoy ${order.name}`,payerClientIp:payerIp(request),
    returnUrl:`${appOrigin()}/findjoy/checkout/${order.id}`,
  }));
  let snapshot:Record<string,unknown>|undefined;
  let attempt=false;
  if(order.requestBody){
    try{
      const current=await xiaodouRequest("GET",`/api/open/v1/payments/${order.id}`);
      confirmSnapshot(order,current);
      if(current.status==="SUCCEEDED")return commerceStore.getOrder(order.id,order.userId)!;
      const pendingAttempt=commerceStore.pendingAttemptRequestId(order.id);
      if(pendingAttempt || current.nextAction==="CREATE_ATTEMPT"){
        attempt=true;
        snapshot=await xiaodouRequest("POST",`/api/open/v1/payments/${order.id}/attempts`,"",pendingAttempt??commerceStore.attemptRequestId(order.id));
      }
    }catch(error){if(!(!attempt && error instanceof XiaodouError && error.status===404))throw error;}
  }
  snapshot??=await xiaodouRequest("POST","/api/open/v1/payments",body,order.requestId);
  confirmSnapshot(order,snapshot);
  if(snapshot.payUrl){
    const payUrl=validatePayUrl(snapshot.payUrl);
    if(typeof snapshot.expireAt!=="string" || !Number.isFinite(Date.parse(snapshot.expireAt)))throw new Error("支付窗口无效");
    commerceStore.savePaymentMaterial(order.id,payUrl,snapshot.expireAt);
    if(attempt)commerceStore.finishAttempt(order.id);
  }
  return commerceStore.getOrder(order.id,order.userId)!;
}

export async function queryPayment(order: JoyOrder):Promise<JoyOrder> {
  if(order.demo || order.status==="SUCCEEDED")return order;
  if(!commerceStore.claimQuery(order.id))return commerceStore.getOrder(order.id,order.userId)!;
  const snapshot=await xiaodouRequest("GET",`/api/open/v1/payments/${encodeURIComponent(order.id)}`);
  confirmSnapshot(order,snapshot);
  return commerceStore.getOrder(order.id,order.userId)!;
}

export function processPaymentWebhook(headers:Headers,raw:Uint8Array):void {
  const config=xiaodouConfig();
  const kid=headers.get("X-XD-Webhook-Key-Id") ?? "";
  const signature=headers.get("X-XD-Webhook-Signature") ?? "";
  const timestamp=headers.get("X-XD-Webhook-Timestamp") ?? "";
  const eventId=headers.get("X-XD-Webhook-Event-Id");
  const eventType=headers.get("X-XD-Webhook-Event-Type");
  if(!eventId || !eventType || !headers.get("X-XD-Webhook-Nonce") || !verifyPlatformSignature(webhookSigningString(headers,raw),signature,kid,timestamp,config.keys))throw new Error("支付通知验证失败");
  const event:unknown=JSON.parse(Buffer.from(raw).toString("utf8"));
  if(!event || typeof event!=="object" || Array.isArray(event))throw new Error("支付事件格式错误");
  const data=event as Record<string,unknown>;
  if(data.eventId!==eventId || data.eventType!==eventType || data.appId!==config.appId || typeof data.outTradeNo!=="string" || !Number.isSafeInteger(data.grossAmountFen))throw new Error("支付事件核对失败");
  if(eventType==="PAYMENT_SUCCEEDED"){
    if(data.status!=="SUCCEEDED" || data.eventAmountFen!==data.grossAmountFen)throw new Error("支付成功金额核对失败");
    commerceStore.confirmPaid(data.outTradeNo,Number(data.grossAmountFen),`${config.appId}:${data.outTradeNo}`,eventId);
  }else if(eventType==="PAYMENT_CLOSED" || eventType==="PAYMENT_FAILED"){
    // 查单补偿会确认最终状态，关闭/失败不能覆盖已成功订单。
    commerceStore.setOrderStatus(data.outTradeNo,eventType==="PAYMENT_CLOSED"?"CLOSED":"FAILED");
  }else{
    // 退款须先明确权益回收规则；不确认未处理的财务事件，保留平台重试及人工核对。
    throw new Error("退款事件需人工核对");
  }
}

export function publicOrder(order:JoyOrder) {
  const {id,name,credits,amountFen,demo,channel,status,payUrl,expiresAt,createdAt}=order;
  return {id,name,credits,amountFen,demo:Boolean(demo),channel,status,payUrl:expiresAt && Date.parse(expiresAt)<=Date.now()?null:payUrl,expiresAt,createdAt};
}
