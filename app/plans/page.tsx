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
        <Link className={index===1?"primary-button account-primary":"plan-button"} href={user?`/checkout?product=${product.id}`:`/login?returnTo=${encodeURIComponent(`/findjoy/checkout?product=${product.id}`)}`}>{demo?"体验购买流程":"充值这份积分"}<span aria-hidden="true">↗</span></Link>
      </article>)}</section>
      <section className="purchase-notes" aria-labelledby="purchase-notes-title"><h2 id="purchase-notes-title">积分使用说明</h2><ul><li>普通模式每局 {NORMAL_LIFE_POINTS} 积分，首幕成功保存后扣除；开局失败，积分退回。</li><li>同一局继续、恢复与查看已保存的回顾，不重复扣积分。</li><li>积分仅用于 FindJoy，不设有效期；其他模式开放后将单独标价。</li></ul></section>
    </main>
  </AccountShell>;
}
