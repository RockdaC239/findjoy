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

interface AccountNavProps {
  children?: ReactNode;
  showRecharge?: boolean;
  /**
   * 手机端把导航项收进账户下拉列表：顶部只留品牌和头像（未登录时是菜单按钮），
   * 桌面端仍然把入口铺开在顶栏。避免手机上导航被挤成第二行。
   */
  collapseOnMobile?: boolean;
}

export function AccountNav({ children, showRecharge = true, collapseOnMobile = false }: AccountNavProps) {
  const user = useContext(AccountUserContext);
  const [open, setOpen] = useState(false);
  const menu = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const menuId = useId();
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [open]);

  const links = <>
    {showRecharge && <Link className="settings-button" href="/plans">积分充值</Link>}
    {children}
  </>;

  return <>
    <div className={`nav-inline${collapseOnMobile ? " nav-inline--collapsible" : ""}`}>{links}</div>
    {user ? <div ref={menu} className="account-menu"
      onMouseEnter={() => { if (window.matchMedia("(hover: hover)").matches) setOpen(true); }}
      onMouseLeave={() => {
        // 触屏设备上点按也可能带出 mouseleave，会把刚打开的下拉立刻关掉。
        if (window.matchMedia("(hover: hover)").matches && !menu.current?.contains(document.activeElement)) setOpen(false);
      }}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}
      onKeyDown={event => {
        if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
      }}>
      <div className="account-menu-trigger">
        <Link
          href="/account"
          className="account-profile-link"
          aria-label={`${user.displayName}的个人中心`}
          onClick={(event) => {
            // 手机上头像即菜单入口（导航项都收在下拉里），个人中心从菜单进入。
            if (collapseOnMobile && window.matchMedia("(max-width: 767px)").matches) {
              event.preventDefault();
              setOpen(true);
            }
          }}
        >
          <AccountAvatar />
          <span className="account-nickname">{user.displayName}</span>
        </Link>
        <button ref={toggle} className="account-menu-toggle" type="button" aria-label="展开账户菜单" aria-expanded={open} aria-controls={menuId} onClick={() => setOpen(value => window.matchMedia("(hover: hover)").matches || !value)}>
          <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" /></svg>
        </button>
      </div>
      {open && <div id={menuId} className="account-dropdown" onClick={(event) => {
        // 退出登录是 <form method="post"> 的原生提交；这里同步卸载下拉会取消提交，必须放行。
        if ((event.target as HTMLElement).closest('button[type="submit"]')) return;
        close();
      }}>
        {collapseOnMobile && <div className="account-dropdown-nav">{links}</div>}
        <Link href="/account" onClick={close}>个人中心 <span aria-hidden="true">↗</span></Link>
        <form action="/findjoy/api/auth/logout" method="post"><button type="submit">退出登录 <span aria-hidden="true">↗</span></button></form>
      </div>}
    </div> : <>
      <Link className="settings-button account-login-link" href="/login">登录 / 注册</Link>
      {collapseOnMobile && <div ref={menu} className="guest-menu">
        <button ref={toggle} className="guest-menu-toggle" type="button" aria-label={open ? "关闭导航菜单" : "打开导航菜单"} aria-expanded={open} aria-controls={`${menuId}-guest`} onClick={() => setOpen(value => !value)}>
          <svg viewBox="0 0 18 18" width="18" height="18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" /></svg>
        </button>
        {open && <div id={`${menuId}-guest`} className="account-dropdown guest-dropdown" onClick={close}>
          <div className="account-dropdown-nav">{links}</div>
          <Link href="/login" onClick={close}>登录 / 注册 <span aria-hidden="true">↗</span></Link>
        </div>}
      </div>}
    </>}
  </>;
}
