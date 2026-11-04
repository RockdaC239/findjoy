import Link from "next/link";
import { redirect } from "next/navigation";
import { BrandLogo } from "../../components/BrandLogo";
import { currentUser } from "../../lib/auth";
import { authingConfigured } from "../../lib/authing";
import { appPathWithoutBase, safeReturnTo } from "../../lib/auth-policy";

export const metadata = { title: "登录 · FindJoy 觅乐" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  const returnTo = safeReturnTo(params.returnTo);
  if (await currentUser()) redirect(appPathWithoutBase(returnTo));
  const configured = authingConfigured();
  return (
    <div className="page account-page">
      <header className="topbar"><BrandLogo href="/" /><nav className="topbar-actions" aria-label="页面导航"><Link className="settings-button" href="/">返回首页</Link></nav></header>
      <main className="login-layout">
        <section className="login-story">
          <p className="eyebrow">A LIFE WORTH EXPLORING</p>
          <h1>人生没有重来。<br /><span>在这里，可以。</span></h1>
          <p className="account-lead">那些没选的路，那些想成为的人。<br />换一种选择，看看生活会如何展开。</p>
          <div className="life-lines" aria-hidden="true"><i /><i /><i /><span>每一种选择，都有回声。</span></div>
          <p className="login-story-foot">不定义成功，也不为幸福打分。</p>
        </section>
        <section className="login-card" aria-labelledby="login-title">
          <span className="account-kicker">YOUR NEXT CHAPTER</span>
          <h2 id="login-title">欢迎回来，探索者。</h2>
          <p>登录后，保存属于你的人生。<br />下一次，从上次的故事继续。</p>
          <div className="login-benefits"><span>01 <b>收藏每一次人生</b></span><span>02 <b>随时回来继续</b></span><span>03 <b>一个账号，连接更多探索</b></span></div>
          {params.error && <p role="alert" className="account-error">{params.error === "unavailable" ? "登录服务暂时不可用，请稍后再试。" : "登录未完成或已过期，请重新开始。"}</p>}
          {configured ? <a className="primary-button account-primary" href={`/findjoy/api/auth/login?returnTo=${encodeURIComponent(returnTo)}`}>登录 / 创建账号 <span aria-hidden="true">↗</span></a> : <p role="status" className="account-notice">登录即将开放，欢迎先了解觅乐。</p>}
          <p className="login-note">首次验证后创建账号。登录过程由 Authing 安全验证；人生内容保存在觅乐，不会自动共享给其他产品。</p>
          <Link className="account-back" href="/">先去看看 ↗</Link>
        </section>
      </main>
      <footer className="account-footer"><span>FindJoy 觅乐 · 把人生的可能，再打开一点。</span><span>ONE ACCOUNT. MORE POSSIBILITIES.</span></footer>
    </div>
  );
}
