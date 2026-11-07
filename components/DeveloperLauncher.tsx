"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useDeveloperMode } from "./DeveloperMode";
import { BrandLogo } from "./BrandLogo";
import { API_BASE } from "../lib/life-session";
import styles from "./DeveloperMode.module.css";

export function DeveloperLauncher() {
  const dev = useDeveloperMode();
  const clicks = useRef({ count: 0, at: 0 });
  const checking = useRef(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState("");
  async function tap() {
    const now = Date.now();
    clicks.current = { count: now - clicks.current.at < 800 ? clicks.current.count + 1 : 1, at: now };
    if (clicks.current.count < 3 || checking.current) return;
    clicks.current.count = 0;
    checking.current = true;
    try {
      const response = await fetch(`${API_BASE}/api/developer`, { cache: "no-store", signal: AbortSignal.timeout(5000) });
      if (response.ok) { setError(""); dialog.current?.showModal(); }
    } catch { setError("调试权限暂未确认，请稍后重试"); }
    finally { checking.current = false; }
  }
  return <>
    <BrandLogo className="wordmark" onClick={tap} aria-label="findjoy" />
    {error && <span className={styles.message} role="status">{error}</span>}
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="developer-entry-title">
      <h2 id="developer-entry-title">开发工具</h2>
      <div className={styles.actions}>
        <button className={`${styles.action} ${styles.primary}`} disabled={dev.busy} onClick={async () => { if (await dev.update({ enabled: !dev.enabled, mock: false })) dialog.current?.close(); }}>{dev.enabled ? "退出调试模式" : "进入调试模式"}</button>
        <Link className={styles.action} href="/admin" onClick={() => dialog.current?.close()}>进入后台 ↗</Link>
        <Link className={styles.action} href="/showcase" onClick={() => dialog.current?.close()}>进入 Showcase ↗</Link>
        <button className={styles.action} onClick={() => dialog.current?.close()}>关闭</button>
      </div>
    </dialog>
  </>;
}
