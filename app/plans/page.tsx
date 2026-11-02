import Link from "next/link";
import { NORMAL_LIFE_POINTS } from "../../lib/points";
import { AccountShell } from "../../components/AccountShell";
import { currentUser } from "../../lib/auth";
import { commerceStore } from "../../lib/commerce-store";
import { formatPrice, products } from "../../lib/products";
export const metadata={title:"积分充值 · FindJoy 觅乐"};

export default async function PlansPage() {
  const user=await currentUser();
  commerceStore.expireOperations();
  const balance=user?commerceStore.balance(user.id):null;
  const orders=user?commerceStore.listOrders(user.id):[];
  const catalog=products();
  const demo=catalog.every(product=>product.demo);
  return <AccountShell>
    <main className="plans-main">
      <section className="plans-heading"><p className="eyebrow">MORE THAN ONE WAY TO LIVE</p><h1>给好奇心，多一点可能。</h1><p className="account-lead">不必抵达某个标准答案。<br />只是再出发一次，看看另一条路上的风景。</p>
      {balance?<div className="credit-pill">我的积分 <strong>{balance.available}</strong> 积分{balance.held>0&&<span> · {balance.held} 积分正在开局</span>}</div>:<Link className="account-back" href="/login?returnTo=%2Ffindjoy%2Fplans">登录，查看我的积分 ↗</Link>}
      </section>
      {demo&&<p className="catalog-notice" role="status"><span>体验预览</span> 以下为积分套餐预览，演示模式不会真实扣款或发放积分。</p>}
      <section className="plan-grid" aria-label="积分充值套餐">{catalog.map((product,index)=><article key={product.id} className={`plan-card ${index===1?"plan-card-featured":""}`}>
        <div className="plan-card-top"><span className="account-kicker">CHAPTER {String(index+1).padStart(2,"0")}</span>{index===1&&<span className="plan-tag">推荐</span>}</div>
        <h2>{product.name}</h2><p>{["给一个未曾做过的选择，一次机会。","不急着下结论，再看看几种生活。","带着好奇心，走过更多人生的岔路。 "][index]??"继续探索属于你的可能。"}</p>
        <div className="plan-price"><small>¥</small>{formatPrice(product.amountFen)}{demo&&<span>演示价</span>}</div>
        <div className="plan-credits"><strong>{product.credits}</strong> 积分 · 普通模式 {product.credits / NORMAL_LIFE_POINTS} 局</div>
        <ul><li>普通模式每局 20 积分</li><li>一局内继续与恢复不重复扣积分</li><li>开局失败，积分退回</li></ul>
        <Link className={index===1?"primary-button account-primary":"plan-button"} href={user?`/checkout?product=${product.id}`:`/login?returnTo=${encodeURIComponent(`/findjoy/checkout?product=${product.id}`)}`}>{demo?"体验购买流程":"充值这份积分"}<span aria-hidden="true">↗</span></Link>
      </article>)}</section>
      <section className="purchase-notes"><div><span className="account-kicker">A LITTLE REASSURANCE</span><h2>放心，把选择交给自己。</h2></div><p>新用户赠送 100 积分，可开启 5 局普通模式。普通模式每局 20 积分，首幕成功保存后消费；继续故事、恢复存档和查看已保存的回顾不重复扣积分。</p><p>积分用于 FindJoy 内的人生体验，不设有效期。其他模式开放后将单独标明积分价格。</p></section>
      {user&&<section id="orders" className="order-history"><h2>我的订单 <span>最近 100 笔</span></h2>{orders.length===0?<p className="account-muted">还没有订单。每一段新故事，都可以慢慢开始。</p>:<div className="order-list">{orders.map(order=><Link key={order.id} href={`/checkout/${order.id}`}><div><strong>{order.name}</strong><span>{order.demo?"演示订单":"人生体验"} · {new Date(order.createdAt).toLocaleDateString("zh-CN")}</span></div><div><strong>¥{formatPrice(order.amountFen)}</strong><span>{order.status==="SUCCEEDED"?"已到账":order.status==="DEMO_COMPLETE"?"演示完成":"查看订单 ↗"}</span></div></Link>)}</div>}</section>}
    </main>
  </AccountShell>;
}
