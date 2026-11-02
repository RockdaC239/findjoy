import { AccountAvatar } from "../../components/AccountAvatar";
import { ProfileNameEditor } from "../../components/ProfileNameEditor";
import { identityStore } from "../../lib/identity-store";
import { formatPrice } from "../../lib/products";
import { NORMAL_LIFE_POINTS } from "../../lib/points";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell } from "../../components/AccountShell";
import { currentUser } from "../../lib/auth";
import { commerceStore } from "../../lib/commerce-store";

export const metadata = { title: "个人中心 · FindJoy 觅乐" };

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?returnTo=%2Ffindjoy%2Faccount");
  await commerceStore.expireOperations();
  const phone = await identityStore.getPhone(user.id);
  const orders = await commerceStore.listOrders(user.id);
  const balance = await commerceStore.balance(user.id);
  const ledger = (await commerceStore.ledger(user.id)).slice(-10).reverse();
  const labels: Record<string, string> = { trial: "新用户积分赠送", purchase: "充值积分到账", life: "开启一段人生" };

  return <AccountShell>
    <main className="profile-main">
      <section className="profile-heading">
        <p className="eyebrow">YOUR NEXT CHAPTER</p>
        <div className="profile-greeting"><AccountAvatar className="profile-avatar" /><div><h1>你好，{user.displayName}。</h1><p>还有很多种人生，等你慢慢探索。</p></div></div>
      </section>
      <section className="profile-balance" aria-labelledby="balance-title">
        <div><h2 id="balance-title">我的积分</h2><p className="profile-credit"><strong>{balance.available}</strong><span>积分可用</span></p><p className="account-muted">{balance.held > 0 ? `${balance.held} 积分正在开局，生成失败会退回。` : `可开启 ${Math.floor(balance.available / NORMAL_LIFE_POINTS)} 局普通模式 · 每局 ${NORMAL_LIFE_POINTS} 积分`}</p></div>
        <div className="profile-balance-actions"><Link className="plan-button" href="/">开始一段人生 <span aria-hidden="true">→</span></Link><Link className="account-back" href="/plans">积分充值 ↗</Link></div>
      </section>
      <div className="profile-details">
        <section className="profile-info" aria-labelledby="info-title"><h2 id="info-title">我的账户</h2><dl><div><dt>昵称</dt><dd><ProfileNameEditor displayName={user.displayName} /></dd></div><div><dt>注册手机</dt><dd>{phone ?? "暂未获取，请重新登录后查看"}</dd></div></dl><Link className="plan-button" href="#orders">查看我的订单 <span aria-hidden="true">↗</span></Link><p className="account-muted">积分仅用于 FindJoy 觅乐。</p></section>
        <section className="profile-records" aria-labelledby="records-title"><h2 id="records-title">最近积分记录 <span>最近 10 笔</span></h2>
          {ledger.length === 0 ? <p className="account-muted">还没有积分变动记录。</p> : <ul className="profile-ledger">{ledger.map((entry, index) => <li key={`${entry.reason}-${entry.reference}-${index}`}><div><strong>{labels[entry.reason] ?? "积分调整"}</strong><time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div><span className={entry.delta > 0 ? "credit-added" : ""}>{entry.delta > 0 ? "+" : ""}{entry.delta} 积分</span></li>)}</ul>}
        </section>
      </div>
      <section id="orders" className="order-history"><h2>我的订单 <span>最近 100 笔</span></h2>{orders.length===0?<p className="account-muted">还没有订单。每一段新故事，都可以慢慢开始。</p>:<div className="order-list">{orders.map(order=><Link key={order.id} href={`/checkout/${order.id}`}><div><strong>{order.name}</strong><span>{order.demo?"演示订单":"人生体验"} · {new Date(order.createdAt).toLocaleDateString("zh-CN")}</span></div><div><strong>¥{formatPrice(order.amountFen)}</strong><span>{order.status==="SUCCEEDED"?"已到账":order.status==="DEMO_COMPLETE"?"演示完成":"查看订单 ↗"}</span></div></Link>)}</div>}</section>
    </main>
  </AccountShell>;
}
