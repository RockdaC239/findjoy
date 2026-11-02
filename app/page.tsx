"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MODEL_PROVIDERS } from "../lib/provider-catalog";
import { BrandLogo } from "../components/BrandLogo";
import { AccountNav } from "../components/AccountNav";
import { ModeLauncher } from "../components/ModeLauncher";
import { MusicToggle } from "../components/MusicToggle";
import { buildLifeView, type LifeView } from "../lib/life-view";
import type { Gender, LifeState } from "../lib/life";
import { useAmbientMusic } from "../lib/use-ambient-music";
import { musicSceneFor } from "../lib/music-scene";
import { setMusicEnabledPreference, useMusicEnabledPreference } from "../lib/music-preference";
import { getLifeScenario, getScenarioLabel } from "../lib/modes/scenario";
import type { StartSelection } from "../lib/modes/types";
import { API_BASE, readActiveLifeId, forgetActiveLife, writePendingStart } from "../lib/life-session";

type ModelConfig = {
  providerId: string;
  model: string;
};

type ModelConfigStatus = {
  mode: "local" | "environment";
  config: { providerId?: string; model?: string; hasApiKey: boolean; apiKeyHint?: string };
};

type LifeSummary = {
  lifeId: string;
  age: number;
  city: string;
  events: number;
  dead: boolean;
  updatedAt: string;
  mode: string;
  modeLabel: string;
  modeShort: string;
};

const defaultModelConfig: ModelConfig = {
  providerId: "deepseek",
  model: "deepseek-chat",
};

export default function StartPage() {
  const router = useRouter();
  const [modelConfig, setModelConfig] = useState<ModelConfig>(defaultModelConfig);
  const [modelConfigMode, setModelConfigMode] = useState<ModelConfigStatus["mode"]>("local");
  const [settingsApiKey, setSettingsApiKey] = useState("");
  const [settingsStatus, setSettingsStatus] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGenderDialog, setShowGenderDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLives, setHistoryLives] = useState<LifeSummary[] | null>(null);
  const [historyDetail, setHistoryDetail] = useState<LifeState | null>(null);
  const [resumableLife, setResumableLife] = useState<LifeView | null>(null);
  const [pendingStart, setPendingStart] = useState<StartSelection>({ mode: "normal" });
  const [isStarting, setIsStarting] = useState(false);
  const musicEnabled = useMusicEnabledPreference();
  const music = useAmbientMusic(musicSceneFor({ phase: "start" }));

  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/model-config`)
      .then(async (response) => (await response.json()) as ModelConfigStatus)
      .then((payload) => {
        if (cancelled) return;
        setModelConfigMode(payload.mode);
        if (payload.config.providerId && payload.config.model) {
          setModelConfig({ providerId: payload.config.providerId, model: payload.config.model });
        }
      })
      .catch(() => { /* use the safe default until the settings API is available */ });
    return () => { cancelled = true; };
  }, []);

  // 断点恢复：本地记住最近一局，若仍在世就在开始页提供"继续"入口。
  useEffect(() => {
    let cancelled = false;
    const lifeId = readActiveLifeId();
    if (!lifeId) return;
    async function loadResumable() {
      try {
        const response = await fetch(`${API_BASE}/api/life/${lifeId}`);
        if (!response.ok) {
          forgetActiveLife();
          return;
        }
        const payload = (await response.json()) as { state?: LifeState };
        if (!payload.state || payload.state.dead === true) {
          forgetActiveLife();
          return;
        }
        if (!cancelled) setResumableLife(buildLifeView(payload.state));
      } catch { /* 网络失败不打扰，下次再来 */ }
    }
    loadResumable();
    return () => { cancelled = true; };
  }, []);

  function toggleMusic() {
    const next = !musicEnabled;
    setMusicEnabledPreference(next);
    if (next) music.start();
    else music.stop();
  }

  function handleStart(selection: StartSelection) {
    setPendingStart(selection);
    setShowGenderDialog(true);
  }

  function startLife(gender: Gender) {
    if (isStarting) return;
    setIsStarting(true);
    writePendingStart({ gender, selection: pendingStart, key: crypto.randomUUID() });
    router.push("/play");
  }

  function resumeLife(lifeId?: string) {
    const target = lifeId ?? resumableLife?.lifeId;
    if (!target) return;
    setShowHistory(false);
    setHistoryDetail(null);
    router.push(`/play?life=${encodeURIComponent(target)}`);
  }

  async function openHistory() {
    setHistoryDetail(null);
    setShowHistory(true);
    if (historyLives !== null) return;
    try {
      const response = await fetch(`${API_BASE}/api/lives`);
      const payload = (await response.json()) as { lives?: LifeSummary[] };
      setHistoryLives(Array.isArray(payload.lives) ? payload.lives : []);
    } catch {
      setHistoryLives([]);
    }
  }

  async function loadLifeDetail(lifeId: string) {
    try {
      const response = await fetch(`${API_BASE}/api/life/${lifeId}`);
      const payload = (await response.json()) as { state?: LifeState };
      if (payload.state) setHistoryDetail(payload.state);
    } catch { /* keep list visible */ }
  }

  async function saveModelSettings() {
    setIsSavingSettings(true);
    setSettingsStatus("");
    try {
      const response = await fetch(`${API_BASE}/api/model-config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...modelConfig, apiKey: settingsApiKey }),
      });
      const payload = (await response.json()) as { error?: string; config?: ModelConfigStatus["config"] };
      if (!response.ok) throw new Error(payload.error || "模型配置保存失败");
      setSettingsApiKey("");
      setSettingsStatus("已保存到本地配置文件，新的请求会使用该模型。");
    } catch (error) {
      setSettingsStatus(error instanceof Error ? error.message : "模型配置保存失败");
    } finally {
      setIsSavingSettings(false);
    }
  }

  const historyMeta = historyDetail ? getScenarioLabel(getLifeScenario(historyDetail)) : null;

  return (
    <main className="page page--start">
      <header className="topbar" aria-label="Primary navigation">
        <BrandLogo href="/showcase" className="wordmark" />
        <div className="topbar-actions"><AccountNav>
          <Link className="settings-button" href="/bookmarks">觅乐书签</Link>
          <button className="settings-button" onClick={openHistory}>过往人生</button>
          <button className="settings-button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>模型设置</button>
          <MusicToggle enabled={musicEnabled} supported={music.supported} onToggle={toggleMusic} />
        </AccountNav></div>
      </header>

      {showSettings && (
        <>
        <div className="modal-scrim" onClick={() => setShowSettings(false)} aria-hidden="true" />
        <section className="settings-panel" aria-label="模型设置">
          <div className="settings-head"><p className="eyebrow">MODEL CONNECTION</p><button className="settings-close" onClick={() => setShowSettings(false)} aria-label="关闭模型设置">×</button></div>
          {modelConfigMode === "environment" ? <p className="settings-note">线上环境由服务端统一配置模型，用户配置不会被使用。</p> : <p className="settings-note">本地配置会保存到项目的 .data/model-config.json，不会提交到 Git。</p>}
          <label>供应商<select value={modelConfigMode === "environment" ? "environment" : modelConfig.providerId} disabled={modelConfigMode === "environment"} onChange={(event) => { const provider = MODEL_PROVIDERS.find((item) => item.id === event.target.value); if (provider) setModelConfig({ providerId: provider.id, model: provider.models[0].id }); }}>
            {modelConfigMode === "environment" ? <option value="environment">服务端环境变量</option> : MODEL_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}
          </select></label>
          <label>模型{modelConfigMode === "environment" ? <input value={modelConfig.model} disabled /> : <select value={modelConfig.model} onChange={(event) => setModelConfig((current) => ({ ...current, model: event.target.value }))}>{(MODEL_PROVIDERS.find((provider) => provider.id === modelConfig.providerId)?.models ?? []).map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select>}</label>
          <label>API Key<input type="password" value={modelConfigMode === "environment" ? "server-managed" : settingsApiKey} placeholder={modelConfigMode === "environment" ? "由服务端统一配置" : "输入后保存到本地文件"} disabled={modelConfigMode === "environment"} onChange={(event) => setSettingsApiKey(event.target.value)} autoComplete="off" /></label>
          {modelConfigMode === "local" && <button className="refresh-models" type="button" onClick={saveModelSettings} disabled={isSavingSettings}>{isSavingSettings ? "保存中…" : "确认并保存"}</button>}
          {settingsStatus && <p className="settings-status" role="status">{settingsStatus}</p>}
        </section>
        </>
      )}

      {showHistory && (
        <div className="history-modal" role="dialog" aria-modal="true" aria-label="过往人生" onClick={(event) => { if (event.target === event.currentTarget) { setHistoryDetail(null); setShowHistory(false); } }}>
          <div className="history-card">
            <div className="history-head">
              <p className="eyebrow">PAST LIVES</p>
              <button className="history-close" onClick={() => { setHistoryDetail(null); setShowHistory(false); }} aria-label="关闭过往人生">×</button>
            </div>
            <div className="history-body">
            {historyDetail ? (
              <div className="history-detail">
                <button className="text-button" onClick={() => setHistoryDetail(null)}>← 返回列表</button>
                <p className="history-detail-meta">{historyMeta ? `${historyMeta.label} · ${historyMeta.detail} · ` : ""}{historyDetail.basic.city} · {historyDetail.basic.age} 岁 · {historyDetail.history.length} 个节点{historyDetail.dead ? " · 已故" : " · 在世"}
                  {(() => {
                    const bg = [historyDetail.flags.bgEconomy, historyDetail.flags.bgStructure, historyDetail.flags.bgEvent].filter((v): v is string => typeof v === "string");
                    return bg.length === 3 ? ` · 出身 ${bg.join("·")}` : "";
                  })()}
                </p>
                {historyDetail.history.length === 0 && <p className="history-note">这局人生还没有留下任何事件。</p>}
                {historyDetail.history.map((h, index) => (
                  <article className="history-event" key={index}>
                    <p className="history-event-title">
                      <strong>{h.age} 岁</strong> · {h.title}
                      {h.storedAt && <span className="history-event-time">{new Date(h.storedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>}
                    </p>
                    <p>{h.story}</p>
                    {h.choices && h.choices.length > 0 && (
                      <p className="history-choices">可选项：{h.choices.map((c) => `${c.id}「${c.text}」`).join("　")}</p>
                    )}
                    {h.choiceText
                      ? <p className="history-choice">你选择了：「{h.choiceText}」</p>
                      : h.choices && h.choices.length > 0
                        ? <p className="history-choice is-pending">—— 本节点尚未做出选择 ——</p>
                        : null}
                    {h.usage && (
                      <p className="history-event-usage">
                        tokens {h.usage.promptTokens}/{h.usage.completionTokens} · 缓存命中 {h.usage.promptCacheHitTokens ?? 0}
                        {h.usage.estimatedCostUsd > 0 ? ` · $${h.usage.estimatedCostUsd.toFixed(4)}` : ""}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="history-list">
                {historyLives === null
                  ? <p className="history-note">正在读取…</p>
                  : historyLives.length === 0
                    ? <p className="history-note">还没有人生记录，去开始第一段人生吧。</p>
                    : historyLives.map((item) => (
                      <div className="history-item" key={item.lifeId}>
                        <button className="history-item-main" onClick={() => loadLifeDetail(item.lifeId)}>
                          <span className="history-item-time">{new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                          <span className="history-item-text"><span className="history-item-mode">{item.modeLabel || "普通模式"}</span>{item.city} · {item.age} 岁 · {item.events} 个节点</span>
                          <span className={`history-item-status ${item.dead ? "is-dead" : ""}`}>{item.dead ? "已故" : "在世"}</span>
                        </button>
                        {item.dead
                          ? <Link className="history-item-resume" href={`/review/${item.lifeId}`}>回顾</Link>
                          : <button className="history-item-resume" onClick={() => resumeLife(item.lifeId)}>继续</button>}
                      </div>
                    ))}
              </div>
            )}
            </div>
          </div>
        </div>
      )}

      {showGenderDialog && (
        <div className="gender-modal" role="dialog" aria-modal="true" aria-label="选择性别">
          <div className="gender-modal-card">
            <h2 id="gender-title">选择你的性别</h2>
            <div className="gender-options">
              <button className="gender-option" type="button" onClick={() => startLife("female")} aria-label="选择女性" disabled={isStarting}>
                <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="7" r="4.2" />
                  <path d="M12 11.2V21M8.6 16.8h6.8" />
                </svg>
              </button>
              <button className="gender-option" type="button" onClick={() => startLife("male")} aria-label="选择男性" disabled={isStarting}>
                <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <circle cx="9.6" cy="14.4" r="4.4" />
                  <path d="M12.8 11.2 21 3M16.5 3H21v4.5" />
                </svg>
              </button>
            </div>
            <button className="gender-close" type="button" onClick={() => setShowGenderDialog(false)}>再想想</button>
          </div>
        </div>
      )}

      <section className="intro intro--modes" aria-labelledby="intro-title">
        <p className="eyebrow">FIND YOUR WAY TO JOY</p>
        <h1 id="intro-title">人生没有答案，只有选择</h1>
        <p className="intro-copy"><span>这一生会从这里开始，而幸福不在别处，就在你的每一次选择里。</span><span className="intro-copy-line--nowrap">阿德勒说，决定我们的不是经历，而是我们赋予经历的意义——没有统一标准，你怎样定义，就有怎样的幸福。</span><span>直到终点回望时，你看见它如何一点点，变成了你自己。</span></p>
        <ModeLauncher
          disabled={isStarting}
          resumableLife={resumableLife}
          isResuming={false}
          onStart={handleStart}
          onResume={() => resumeLife()}
        />
      </section>
    </main>
  );
}
