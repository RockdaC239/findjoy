"use client";
import Link from "next/link";
import { useEffect,useRef,useState } from "react";
import type { PayChannel,Product } from "../lib/commerce-store";
import { formatPrice } from "../lib/products";

export interface PublicOrder {id:string;name:string;credits:number;amountFen:number;demo:boolean;channel:PayChannel;status:string;payUrl:string|null;expiresAt:string|null;createdAt:number}

export function Checkout({product,initialOrder}:{product?:Product;initialOrder?:PublicOrder}) {
  const [order,setOrder]=useState(initialOrder);
  const [channel,setChannel]=useState<PayChannel>(initialOrder?.channel??"ALIPAY_H5");
  const [busy,setBusy]=useState(false),[error,setError]=useState("");
  const key=useRef<string>("");
  const item=order??product;
  const done=order?.status==="SUCCEEDED"||order?.status==="DEMO_COMPLETE";

  const orderId=order?.id;
  const isDemo=order?.demo;
  useEffect(()=>{
    if(!orderId || isDemo || done)return;
    let active=true;
    const started=Date.now();
    const timer=setInterval(async()=>{
      if(Date.now()-started>10*60*1000){clearInterval(timer);return;}
      try{
        const response=await fetch(`/findjoy/api/orders/${orderId}`);
        if(!response.ok)return;
        const result=await response.json();
        if(active){setOrder(result.order);if(result.warning)setError(result.warning);}
      }catch{ /* 手动查询仍可重试，网络失败不判付款失败。 */ }
    },5000);
    return()=>{active=false;clearInterval(timer);};
  },[orderId,isDemo,done]);

  async function create(){
    if(!product || busy)return;
    setBusy(true);setError("");
    if(!key.current)key.current=crypto.randomUUID();
    try{
      const response=await fetch("/findjoy/api/orders",{method:"POST",headers:{"Content-Type":"application/json","Idempotency-Key":key.current},body:JSON.stringify({productId:product.id,channel})});
      const result=await response.json();
      if(!response.ok)throw new Error(result.error??"暂时无法创建订单");
      setOrder(result.order);if(result.warning)setError(result.warning);
      window.history.replaceState(null,"",`/findjoy/checkout/${result.order.id}`);
    }catch(cause){setError(cause instanceof Error?cause.message:"创建失败，请稍后重试");}
    finally{setBusy(false);}
  }
  async function refresh(simulate=false){
    if(!order || busy)return;
    setBusy(true);setError("");
    try{
      if(simulate){const response=await fetch(`/findjoy/api/orders/${order.id}/demo`,{method:"POST"});if(!response.ok)throw new Error("演示暂未完成，请重试");}
      const response=await fetch(`/findjoy/api/orders/${order.id}`);
      const result=await response.json();if(!response.ok)throw new Error(result.error??"查询失败");
      setOrder(result.order);if(result.warning)setError(result.warning);
    }catch(cause){setError(cause instanceof Error?cause.message:"网络暂时不可用");}finally{setBusy(false);}
  }
  async function retry(){
    if(!order||busy)return;
    setBusy(true);setError("");
    try{
      const response=await fetch(`/findjoy/api/orders/${order.id}/retry`,{method:"POST"});
      const result=await response.json();if(!response.ok)throw new Error(result.error??"暂时无法获取支付链接");
      setOrder(result.order);if(result.warning)setError(result.warning);
    }catch(cause){setError(cause instanceof Error?cause.message:"请稍后再试");}finally{setBusy(false);}
  }
  if(!item)return null;
  return <main className="checkout-main">
    <Link className="account-back" href="/plans">← 返回人生体验</Link>
    <div className="checkout-title"><p className="eyebrow">A NEW CHAPTER AWAITS</p><h1>{done?"下一段故事，等你开启。":"准备好，再出发一次。"}</h1><p className="account-lead">{item.demo?"这是购买流程预览，不会产生真实扣款。":"安全完成支付，继续探索人生的可能。"}</p></div>
    <div className="checkout-grid">
      <section className="checkout-summary"><span className="account-kicker">YOUR SELECTION</span><h2>{item.name}</h2><p className="checkout-count"><strong>{item.credits}</strong> 次人生体验</p><p className="account-muted">一局新的故事，一种不同的生活。<br />同一局内继续与恢复，不重复扣次。</p><div className="checkout-total"><span>{item.demo?"演示金额":"应付金额"}</span><strong>¥{formatPrice(item.amountFen)}</strong></div>{order&&<p className="order-number">订单编号<br />{order.id}</p>}</section>
      <section className="checkout-payment" aria-label="付款与订单状态">
        {done?<><div className="payment-check" aria-hidden="true">✓</div><h2>{order?.demo?"购买流程演示完成":"支付成功，次数已到账"}</h2><p className="account-muted">{order?.demo?"没有发生真实扣款，也未增加真实体验次数。正式套餐价格确定后，这里会连接真实支付。":"你可以回到觅乐，开始下一段人生。"}</p><Link className="primary-button account-primary" href="/">回到觅乐 <span>↗</span></Link></>:<>
          <span className="account-kicker">{order?"PAYMENT STATUS":"PAY YOUR WAY"}</span><h2>{order?"你的订单已准备好":"选择支付方式"}</h2>
          {!order?<><fieldset className="payment-methods"><legend className="sr-only">支付方式</legend>{([['ALIPAY_H5','支付宝','支'],['WECHAT_H5','微信支付','微']] as const).map(([value,label,icon])=><label key={value} className={channel===value?"selected":""}><input type="radio" name="channel" value={value} checked={channel===value} onChange={()=>setChannel(value)} /><span className={`payment-icon ${value==='WECHAT_H5'?'wechat':''}`}>{icon}</span><span>{label}</span><span className="radio-dot" aria-hidden="true" /></label>)}</fieldset><button className="primary-button account-primary" onClick={create} disabled={busy}>{busy?"正在准备订单…":item.demo?"创建演示订单":"确认订单"}<span>↗</span></button></>:<>
            <p className="payment-status" role="status">{order.status==="UNKNOWN"?"支付结果待确认，请勿重复付款。":order.status==="CLOSED"?"支付窗口已关闭，可查询最终结果。":order.status==="FAILED"?"支付尚未完成，请查询最终结果。":order.demo?"演示订单已创建，可模拟支付结果。":"等待支付，完成后将自动确认到账。"}</p>
            {order.demo?<button className="primary-button account-primary" onClick={()=>refresh(true)} disabled={busy}>{busy?"正在确认…":"模拟支付完成"}<span>↗</span></button>:<>{order.payUrl&&<a href={order.payUrl} className="primary-button account-primary" target="_blank" rel="noopener noreferrer">前往安全收银台 <span>↗</span></a>}{!order.payUrl && order.status!=="UNKNOWN" && <button className="primary-button account-primary" onClick={retry} disabled={busy}>重新获取支付链接 <span>↗</span></button>}<button className="plan-button" onClick={()=>refresh()} disabled={busy}>{busy?"正在查询…":"我已支付，查询结果"}</button></>}
          </>}
          <p className="login-note">{item.demo?"演示仅用于体验页面与流程。真实支付上线后，才会按已确认价格收款。":"支付由小豆支付收银台处理。到账以服务端核验为准，关闭页面不会丢失订单。"}</p>
        </>}
        {error&&<p className="account-error" role="alert">{error}</p>}
        <Link className="account-back" href="/plans">查看我的体验与订单 ↗</Link>
      </section>
    </div>
  </main>;
}
