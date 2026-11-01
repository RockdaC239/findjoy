import Link from "next/link";
import { AccountShell } from "../../components/AccountShell";
import { currentUser } from "../../lib/auth";
import { commerceStore } from "../../lib/commerce-store";
import { formatPrice, products } from "../../lib/products";
export const metadata={title:"人生体验 · FindJoy 觅乐"};

export default async function PlansPage() {
  const user=await currentUser();
  commerceStore.expireOperations();
  const balance=user?commerceStore.balance(user.id):null;
  const orders=user?commerceStore.listOrders(user.id):[];
  const catalog=products();
  const demo=catalog.every(product=>product.demo);
  return <AccountShell>
    <main className="plans-main">
      <section className="plans-heading"><p className="eyebrow">MORE THAN ONE WAY TO LIVE</p><h1>给人生，多一种可能。</h1><p className="account-lead">不必抵达某个标准答案。<br />只是再出发一次，看看另一条路上的风景。</p>
      {balance?<div className="credit-pill">我的体验 <strong>{balance.available}</strong> 次{balance.held>0&&<span> · {balance.held} 次正在开局</span>}</div>:<Link className="account-back" href="/login?returnTo=%2Ffindjoy%2Fplans">登录，查看我的体验 ↗</Link>}
      </section>
      {demo&&<p className="catalog-notice" role="status"><span>体验预览</span> 以下为演示套餐与演示价格。可预览完整购买流程，不会真实扣款或发放付费次数。</p>}
      <section className="plan-grid" aria-label="人生体验套餐">{catalog.map((product,index)=><article key={product.id} className={`plan-card ${index===1?"plan-card-featured":""}`}>
        <div className="plan-card-top"><span className="account-kicker">CHAPTER {String(index+1).padStart(2,"0")}</span>{index===1&&<span className="plan-tag">慢慢探索</span>}</div>
        <h2>{product.name}</h2><p>{["给一个未曾做过的选择，一次机会。","不急着下结论，再看看几种生活。","带着好奇心，走过更多人生的岔路。 "][index]??"继续探索属于你的可能。"}</p>
        <div className="plan-price"><small>¥</small>{formatPrice(product.amountFen)}{demo&&<span>演示价</span>}</div>
        <div className="plan-credits"><strong>{product.credits}</strong> 次人生体验</div>
        <ul><li>普通、主题、剧本与 ForU 人生</li><li>一局内继续与恢复不重复扣次</li><li>开局未完成，体验次数退回</li></ul>
        <Link className={index===1?"primary-button account-primary":"plan-button"} href={user?`/checkout?product=${product.id}`:`/login?returnTo=${encodeURIComponent(`/findjoy/checkout?product=${product.id}`)}`}>{demo?"体验购买流程":"选择这份体验"}<span aria-hidden="true">↗</span></Link>
      </article>)}</section>
      <section className="purchase-notes"><div><span className="account-kicker">A LITTLE REASSURANCE</span><h2>放心，把选择交给自己。</h2></div><p>一次体验，对应一次新的人生开局。首幕成功保存后消费一次；继续故事、恢复存档和查看已保存的回顾，不会重复收费。</p><p>账号未来可连接 FindFire；觅乐的体验次数独立使用，不与其他产品的会员权益混合。</p></section>
      {user&&<section id="orders" className="order-history"><h2>我的订单 <span>最近 100 笔</span></h2>{orders.length===0?<p className="account-muted">还没有订单。每一段新故事，都可以慢慢开始。</p>:<div className="order-list">{orders.map(order=><Link key={order.id} href={`/checkout/${order.id}`}><div><strong>{order.name}</strong><span>{order.demo?"演示订单":"人生体验"} · {new Date(order.createdAt).toLocaleDateString("zh-CN")}</span></div><div><strong>¥{formatPrice(order.amountFen)}</strong><span>{order.status==="SUCCEEDED"?"已到账":order.status==="DEMO_COMPLETE"?"演示完成":"查看订单 ↗"}</span></div></Link>)}</div>}</section>}
    </main>
  </AccountShell>;
}
