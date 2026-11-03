"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useRef, useState, type ReactNode } from "react";
import { API_BASE } from "../lib/life-session";
import type { DeveloperMode } from "../lib/developer-mode";
import styles from "./DeveloperMode.module.css";

interface DeveloperContext extends DeveloperMode {
  busy: boolean;
  update: (settings: DeveloperMode) => Promise<boolean>;
}
const Context = createContext<DeveloperContext>({ enabled: false, mock: false, busy: false, update: async () => false });
export const useDeveloperMode = () => useContext(Context);

export function DeveloperModeProvider({ allowed, initial, children }: { allowed: boolean; initial: DeveloperMode; children: ReactNode }) {
  const router = useRouter();
  const [settings, setSettings] = useState<DeveloperMode>(allowed ? initial : { enabled: false, mock: false });
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const grantKey = useRef("");
  async function update(value: DeveloperMode) {
    if (!allowed || busy) return false;
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/developer`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(value), signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "调试设置更新失败");
      setSettings(result);
      return true;
    } catch (error) { setMessage(error instanceof Error ? error.message : "请求失败，请重试"); return false; }
    finally { setBusy(false); }
  }
  async function grant() {
    if (busy) return;
    grantKey.current ||= crypto.randomUUID();
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/developer/credits`, { method: "POST", headers: { "Idempotency-Key": grantKey.current }, signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "积分发放失败");
      grantKey.current = "";
      setMessage(`已增加 1000 积分，余额 ${result.balance.available} 积分`);
      router.refresh();
    } catch (error) { setMessage(error instanceof Error ? error.message : "请求失败，请重试"); }
    finally { setBusy(false); }
  }
  return <Context.Provider value={{ ...settings, busy, update }}>
    {allowed && settings.enabled && <>
      <div className={styles.corner} aria-label="dev 调试模式"><span>dev</span></div>
      <aside className={styles.toolbar} aria-label="页面调试工具">
        <button className={styles.control} role="switch" aria-checked={settings.mock} disabled={busy} onClick={() => update({ enabled: true, mock: !settings.mock })}>普通模式 Mock：{settings.mock ? "开启" : "关闭"}</button>
        <button className={styles.control} disabled={busy} onClick={grant}>增加 1000 积分</button>
        <span className={styles.hint}>Mock 新局：童年 → 选择 → 告别，不扣积分</span>
      </aside>
    </>}
    {message && <p className={styles.message} role="status">{message}</p>}
    {children}
  </Context.Provider>;
}
