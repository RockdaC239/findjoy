"use client";

import Link from "next/link";
import { AccountAvatar } from "./AccountAvatar";
import { createContext, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";

const AccountUserContext = createContext<{ displayName: string } | null>(null);

export function AccountUserProvider({ user, children }: { user: { displayName: string } | null; children: ReactNode }) {
  return <AccountUserContext.Provider value={user}>{children}</AccountUserContext.Provider>;
}

export function useAccountUser() {
  return useContext(AccountUserContext);
}

export function AccountNav({ children }: { children?: ReactNode }) {
  const user = useContext(AccountUserContext);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  return <>
    {children}
    {user ? <div ref={menu} className="account-menu"
      onMouseEnter={() => { if (window.matchMedia("(hover: hover)").matches) setOpen(true); }}
      onMouseLeave={() => { if (!menu.current?.contains(document.activeElement)) setOpen(false); }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
      }}>
      <div className="account-menu-trigger">
        <Link href="/account" className="account-profile-link" aria-label={`${user.displayName}的个人中心`}>
          <AccountAvatar />
          <span className="account-nickname">{user.displayName}</span>
        </Link>
        <button ref={toggle} className="account-menu-toggle" type="button" aria-label="展开账户菜单" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => window.matchMedia("(hover: hover)").matches || !value)}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
      {open && <div id={menuId} className="account-dropdown">
        <Link href="/account" onClick={() => setOpen(false)}>个人中心 <span aria-hidden="true">↗</span></Link>
        <form action="/findjoy/api/auth/logout" method="post"><button type="submit">退出登录 <span aria-hidden="true">↗</span></button></form>
      </div>}
    </div> : <Link className="settings-button" href="/login">登录 / 注册</Link>}
  </>;
}
