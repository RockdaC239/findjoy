"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useLayoutEffect, useId, useRef, useState, type ReactNode } from "react";
import { developerPanelPosition } from "../lib/developer-panel-position";
import { API_BASE } from "../lib/life-session";
import type { DeveloperMode } from "../lib/developer-mode";
import styles from "./DeveloperMode.module.css";

interface DeveloperContext extends DeveloperMode {
  busy: boolean;
  panelOpen: boolean;
  panelId: string;
  togglePanel: (trigger: HTMLElement) => void;
  update: (settings: DeveloperMode) => Promise<boolean>;
}
const Context = createContext<DeveloperContext>({ enabled: false, mock: false, busy: false, panelOpen: false, panelId: "developer-remote", togglePanel: () => {}, update: async () => false });
export const useDeveloperMode = () => useContext(Context);

export function DeveloperModeProvider({ allowed, initial, children }: { allowed: boolean; initial: DeveloperMode; children?: ReactNode }) {
  const router = useRouter();
  const [panelOpen, setPanelOpen] = useState(false);
  const panelId = useId();
  const panel = useRef<HTMLElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  function closePanel() { setPanelOpen(false); opener.current?.focus(); }
  const [position, setPosition] = useState<ReturnType<typeof developerPanelPosition>>();
  function togglePanel(trigger: HTMLElement) {
    if (panelOpen) { closePanel(); return; }
    opener.current = trigger;
    setPanelOpen(true);
  }
  useLayoutEffect(() => {
    if (!panelOpen || !panel.current) return;
    const element = panel.current;
    function reposition() {
      const trigger = opener.current;
      if (!trigger?.isConnected) { setPanelOpen(false); return; }
      const anchor = trigger.getBoundingClientRect();
      if (anchor.bottom <= 0 || anchor.top >= window.innerHeight) { setPanelOpen(false); return; }
      const bounds = element.getBoundingClientRect();
      setPosition(developerPanelPosition(anchor, { width: bounds.width, height: Math.max(bounds.height, element.scrollHeight) }, { width: window.innerWidth, height: window.innerHeight }));
    }
    reposition();
    element.focus({ preventScroll: true });
    window.addEventListener("resize", reposition);
    window.addEventListener("scroll", reposition, true);
    const observer = new ResizeObserver(reposition);
    observer.observe(element);
    if (opener.current) observer.observe(opener.current);
    return () => {
      window.removeEventListener("resize", reposition);
      window.removeEventListener("scroll", reposition, true);
      observer.disconnect();
    };
  }, [panelOpen]);
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
      if (!result.enabled) setPanelOpen(false);
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
  return <Context.Provider value={{ ...settings, busy, update, panelOpen, panelId, togglePanel }}>
    {allowed && settings.enabled && <>
      <div className={styles.corner} aria-label="dev 调试模式"><span>dev</span></div>
      {panelOpen && <aside ref={panel} id={panelId} className={styles.remote} style={position} role="dialog" aria-modal="false" aria-labelledby={`${panelId}-title`} tabIndex={-1} onKeyDown={event => { if (event.key === "Escape") { event.stopPropagation(); closePanel(); } }}>
        <header className={styles.remoteHeader}><div><span>DEV TOOLS</span><h2 id={`${panelId}-title`}>调试遥控器</h2></div><button className={styles.collapse} onClick={closePanel} aria-label="收起调试遥控器">×</button></header>
        <div className={styles.remoteBody}>
          <button className={styles.control} role="switch" aria-checked={settings.mock} disabled={busy} onClick={() => update({ enabled: true, mock: !settings.mock })}>普通模式 Mock：{settings.mock ? "开启" : "关闭"}</button>
          <button className={styles.control} disabled={busy} onClick={grant}>增加 1000 积分</button>
          <p className={styles.hint}>Mock 新局：童年 → 选择 → 告别，不扣积分</p>
          {message && <p className={styles.message} role="status">{message}</p>}
        </div>
      </aside>}
    </>}
    {children}
  </Context.Provider>;
}

export function DeveloperDebugButton() {
  const dev = useDeveloperMode();
  if (!dev.enabled) return null;
  return <button className={styles.debugButton} type="button" onClick={event => dev.togglePanel(event.currentTarget)} aria-label={dev.panelOpen ? "收起调试遥控器" : "打开调试遥控器"} aria-expanded={dev.panelOpen} aria-controls={dev.panelId}>
    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="M9 7V5a3 3 0 0 1 6 0v2M5 10h2m10 0h2M5 15h2m10 0h2M8 4 6 2m10 2 2-2M12 8v11" /><rect x="7" y="7" width="10" height="14" rx="5" /></svg>
  </button>;
}
