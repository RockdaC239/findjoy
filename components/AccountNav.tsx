"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export function AccountNav() {
  const [user, setUser] = useState<{ displayName: string } | null>(null);
  useEffect(() => {
    let active = true;
    fetch("/findjoy/api/auth/me").then(response => response.json()).then(data => {
      if (active) setUser(data.user ?? null);
    }).catch(() => {});
    return () => { active = false; };
  }, []);
  if (!user) return <Link className="settings-button account-control" href="/login">登录 / 注册</Link>;
  return <><Link className="settings-button account-control" href="/plans">我的体验</Link><form action="/findjoy/api/auth/logout" method="post"><button className="settings-button account-control" type="submit">退出登录</button></form></>;
}
