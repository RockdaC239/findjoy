import Link from "next/link";
import { NORMAL_LIFE_POINTS, SIGNUP_POINTS } from "../../lib/points";
import { PointsUsageDialog } from "../../components/PointsUsageDialog";
import { AccountShell } from "../../components/AccountShell";
import { currentUser } from "../../lib/auth";
import { commerceStore } from "../../lib/commerce-store";
import { formatPrice, products } from "../../lib/products";
export const metadata={title:"积分充值 · FindJoy 觅乐"};

export default async function PlansPage() {
  const user=await currentUser();
  await commerceStore.expireOperations();
  const balance=user?await commerceStore.balance(user.id):null;
  const catalog=products();
  const single=catalog.find(product=>product.id==="single");
  const packs=catalog.filter(product=>product.id!=="single");
  const demo=catalog.every(product=>product.demo);
  const signupPoints=Number(process.env.FINDJOY_TRIAL_CREDITS ?? SIGNUP_POINTS);
  const checkoutHref=(id:string)=>user?`/checkout?product=${id}`:`/login?returnTo=${encodeURIComponent(`/findjoy/checkout?product=${id}`)}`;
  return <AccountShell showRecharge={false}>
    <main className="plans-main">
      <section className="plans-heading"><p className="eyebrow">MORE THAN ONE WAY TO LIVE</p><h1>给好奇心，多一点可能</h1>
      {signupPoints>0&&<p className="account-lead">新用户注册赠送 {signupPoints} 积分，可免费体验 {signupPoints/NORMAL_LIFE_POINTS} 次普通模式。</p>}
      <div className="plans-credit-actions">{balance?<div className="credit-pill">我的积分 <strong>{balance.available}</strong> 积分{balance.held>0&&<span> · {balance.held} 积分正在开局</span>}</div>:<Link className="account-back" href="/login?returnTo=%2Ffindjoy%2Fplans">登录，查看我的积分 ↗</Link>}<PointsUsageDialog /></div>
      </section>
      {demo&&<p className="catalog-notice" role="status"><span>体验预览</span> 以下为积分套餐预览，演示模式不会真实扣款或发放积分。</p>}
      {single&&<section className="single-purchase" aria-labelledby="single-purchase-title">
        <div className="single-purchase-copy"><h2 id="single-purchase-title">普通模式单次购买</h2><p>{single.credits} 积分 · 玩一局普通模式</p></div>
        <div className="plan-price"><small>¥</small>{formatPrice(single.amountFen)}{demo&&<span>演示价</span>}</div>
        <Link className="plan-button" href={checkoutHref(single.id)}>{demo?"体验单次购买":"购买单次"}<span aria-hidden="true">↗</span></Link>
      </section>}
      <section className="plan-grid" aria-label="积分充值套餐">{packs.map((product,index)=><article key={product.id} className={`plan-card ${product.id==="standard"?"plan-card-featured":""}`}>
        <div className="plan-card-top"><span className="account-kicker">CHAPTER {String(index+1).padStart(2,"0")}</span>{product.id==="standard"&&<span className="plan-tag">推荐</span>}</div>
        <h2>{product.name}</h2>
        <div className="plan-price"><small>¥</small>{formatPrice(product.amountFen)}{demo&&<span>演示价</span>}</div>
        <div className="plan-credits"><strong>{product.credits}</strong> 积分 · 普通模式 {product.credits / NORMAL_LIFE_POINTS} 局</div>
        <p className="plan-unit-price">折合 ¥{(product.amountFen/(product.credits/NORMAL_LIFE_POINTS)/100).toFixed(2)}/局{product.id==="standard"&&single&&product.amountFen/product.credits<single.amountFen/single.credits&&<>，比单次购买省约 {Math.round((1-(product.amountFen/product.credits)/(single.amountFen/single.credits))*100)}%</>}</p>
        <Link className={product.id==="standard"?"primary-button account-primary":"plan-button"} href={checkoutHref(product.id)}>{demo?"体验购买流程":"充值这份积分"}<span aria-hidden="true">↗</span></Link>
      </article>)}</section>
    </main>
  </AccountShell>;
}
