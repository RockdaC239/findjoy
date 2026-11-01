import Link from "next/link";
import type { ReactNode } from "react";
import { BrandLogo } from "./BrandLogo";
import { AccountNav } from "./AccountNav";

export function AccountShell({children}:{children:ReactNode}) {
  return <div className="page account-page">
    <header className="topbar"><BrandLogo href="/" /><nav className="topbar-actions" aria-label="账号导航"><Link className="settings-button" href="/">回到人生</Link><AccountNav /></nav></header>
    {children}
    <footer className="account-footer"><span>FindJoy 觅乐 · 故事优先于数字。</span><span>YOUR LIFE, YOUR POSSIBILITIES.</span></footer>
  </div>;
}
