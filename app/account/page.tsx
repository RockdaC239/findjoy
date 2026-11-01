import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountShell } from "../../components/AccountShell";
import { currentUser } from "../../lib/auth";
import { commerceStore } from "../../lib/commerce-store";

export const metadata = { title: "个人中心 · FindJoy 觅乐" };

export default async function AccountPage() {
  const user = await currentUser();
  if (!user) redirect("/login?returnTo=%2Ffindjoy%2Faccount");
  commerceStore.expireOperations();
  const balance = commerceStore.balance(user.id);
  const ledger = commerceStore.ledger(user.id).slice(-10).reverse();
  const labels: Record<string, string> = { trial: "首次体验赠送", purchase: "购买体验到账", life: "开启一段人生" };

  return <AccountShell>
    <main className="profile-main">
      <section className="profile-heading">
        <p className="eyebrow">YOUR NEXT CHAPTER</p>
        <div className="profile-greeting"><span className="account-avatar profile-avatar" aria-hidden="true">{Array.from(user.displayName)[0]}</span><div><h1>你好，{user.displayName}。</h1><p>还有很多种人生，等你慢慢探索。</p></div></div>
      </section>
      <section className="profile-balance" aria-labelledby="balance-title">
        <div><h2 id="balance-title">我的体验次数</h2><p className="profile-credit"><strong>{balance.available}</strong><span>次可用</span></p><p className="account-muted">{balance.held > 0 ? `${balance.held} 次正在开局，生成完成后计入使用。` : "每次开启，都是另一种可能。"}</p></div>
        <div className="profile-balance-actions"><Link className="plan-button" href="/">开始一段人生 <span aria-hidden="true">→</span></Link><Link className="account-back" href="/plans">补充体验次数 ↗</Link></div>
      </section>
      <div className="profile-details">
        <section className="profile-records" aria-labelledby="records-title"><h2 id="records-title">最近次数记录 <span>最近 10 笔</span></h2>
          {ledger.length === 0 ? <p className="account-muted">还没有次数变动记录。</p> : <ul className="profile-ledger">{ledger.map((entry, index) => <li key={`${entry.reason}-${entry.reference}-${index}`}><div><strong>{labels[entry.reason] ?? "体验次数调整"}</strong><time dateTime={new Date(entry.createdAt).toISOString()}>{new Date(entry.createdAt).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</time></div><span className={entry.delta > 0 ? "credit-added" : ""}>{entry.delta > 0 ? "+" : ""}{entry.delta} 次</span></li>)}</ul>}
        </section>
        <section className="profile-info" aria-labelledby="info-title"><h2 id="info-title">我的账户</h2><dl><div><dt>昵称</dt><dd>{user.displayName}</dd></div><div><dt>账户编号</dt><dd className="profile-user-id">{user.id}</dd></div></dl><Link className="plan-button" href="/plans#orders">查看我的订单 <span aria-hidden="true">↗</span></Link><p className="account-muted">体验次数仅用于 FindJoy 觅乐。</p></section>
      </div>
    </main>
  </AccountShell>;
}
