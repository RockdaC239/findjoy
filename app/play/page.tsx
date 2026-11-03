"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountNav } from "../../components/AccountNav";
import { BrandLogo } from "../../components/BrandLogo";
import { MusicToggle } from "../../components/MusicToggle";
import { parseSseMessages } from "../../lib/sse";
import { readStreamedEvent, type StreamedEvent } from "../../lib/stream-event";
import { buildLifeView, type LifeView } from "../../lib/life-view";
import type { LifeState } from "../../lib/life";
import { useAmbientMusic } from "../../lib/use-ambient-music";
import { musicSceneFor } from "../../lib/music-scene";
import { setMusicEnabledPreference, useMusicEnabledPreference } from "../../lib/music-preference";
import { getScenarioLabel } from "../../lib/modes/scenario";
import { previewStart } from "../../lib/modes/start";
import {
  API_BASE,
  clearPendingStart,
  discardPendingStartOnError,
  forgetActiveLife,
  readActiveLifeId,
  readPendingStart,
  rememberActiveLife,
  type PendingStart,
} from "../../lib/life-session";

type ModelConfig = {
  providerId: string;
  model: string;
};

const defaultModelConfig: ModelConfig = {
  providerId: "deepseek",
  model: "deepseek-chat",
};

const LIFE_REQUEST_TIMEOUT_MS = 90_000;
const CHILDHOOD_BOUNDARY = 15;
const LOGIN_RETURN_TO = "/findjoy/play";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stateFromPayload(payload: unknown): LifeState | null {
  if (!isRecord(payload) || !isRecord(payload.state)) return null;
  return payload.state as unknown as LifeState;
}

async function loadModelConfig(): Promise<ModelConfig> {
  try {
    const response = await fetch(`${API_BASE}/api/model-config`, { signal: AbortSignal.timeout(5000) });
    if (!response.ok) return defaultModelConfig;
    const payload = (await response.json()) as { config?: { providerId?: string; model?: string } };
    if (payload.config?.providerId && payload.config?.model) {
      return { providerId: payload.config.providerId, model: payload.config.model };
    }
  } catch { /* use the default */ }
  return defaultModelConfig;
}

export default function PlayPage() {
  const router = useRouter();
  const booted = useRef(false);
  const redirecting = useRef(false);
  const lastError = useRef("");
  const [life, setLife] = useState<LifeView | null>(null);
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(defaultModelConfig);
  const [requestError, setRequestError] = useState("");
  const [streamingEvent, setStreamingEvent] = useState<StreamedEvent>({ story: "", title: "", choices: [] });
  const [showExitDialog, setShowExitDialog] = useState(false);
  const musicEnabled = useMusicEnabledPreference();
  const musicScene = musicSceneFor({ phase: "event", scenario: life?.scenario, eventType: life?.eventType });
  const music = useAmbientMusic(musicScene);

  function toggleMusic() {
    const next = !musicEnabled;
    setMusicEnabledPreference(next);
    if (next) music.start();
    else music.stop();
  }

  function startMusicIfEnabled() {
    if (musicEnabled) music.start();
  }

  async function requestLife(url: string, body?: Record<string, unknown>, idempotencyKey?: string, config?: ModelConfig): Promise<unknown | null> {
    setIsLoading(true);
    setRequestError("");
    setStreamingEvent({ story: "", title: "", choices: [] });
    lastError.current = "";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}) },
        signal: AbortSignal.timeout(LIFE_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ ...(body ?? {}), modelConfig: config ?? modelConfig }),
      });
      if (response.status === 401) {
        redirecting.current = true;
        router.replace(`/login?returnTo=${encodeURIComponent(LOGIN_RETURN_TO)}`);
        return null;
      }
      if (response.status === 402) {
        redirecting.current = true;
        router.replace("/plans");
        return null;
      }
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string; code?: string; operationId?: string } | null;
        if (payload?.code === "START_PENDING" && payload.operationId) {
          for (let attempt = 0; attempt < 30; attempt++) {
            await new Promise((resolve) => setTimeout(resolve, 1000));
            const statusResponse = await fetch(`${API_BASE}/api/life/operations/${encodeURIComponent(payload.operationId)}`);
            if (!statusResponse.ok) break;
            const result = await statusResponse.json() as { status: string; state?: unknown };
            if (result.status === "complete" && result.state) return { state: result.state };
            if (result.status === "failed") { clearPendingStart(); break; }
          }
        }
        discardPendingStartOnError(payload?.code);
        throw new Error(payload?.error || "人生服务暂时不可用，请稍后重试。");
      }
      if (response.headers.get("content-type")?.includes("application/json")) return (await response.json()) as unknown;
      if (!response.body) throw new Error("Life stream unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let generated = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parsed = parseSseMessages(buffer);
        buffer = parsed.remainder;
        for (const message of parsed.messages) {
          if (message.event === "status") {
            // status 仅作服务端流式开始信号，事件文本随后到达。
          } else if (message.event === "token") {
            const token = JSON.parse(message.data) as { text?: string };
            if (typeof token.text === "string") {
              generated += token.text;
              setStreamingEvent(readStreamedEvent(generated));
            }
          } else if (message.event === "retry") {
            generated = "";
            setStreamingEvent({ story: "", title: "", choices: [] });
          } else if (message.event === "complete") {
            return JSON.parse(message.data) as unknown;
          } else if (message.event === "error") {
            const payload = JSON.parse(message.data) as { error?: string; code?: string };
            discardPendingStartOnError(payload.code);
            throw new Error(payload.error ?? "Life service unavailable");
          }
        }
      }
      throw new Error("Life stream ended before completion");
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        lastError.current = "本次等待超时，故事可能仍在生成，请重试恢复进度。";
      } else {
        lastError.current = error instanceof Error && error.message ? error.message : "人生服务暂时不可用，请检查模型设置后重试。";
      }
      setRequestError(lastError.current);
      return null;
    } finally {
      setIsLoading(false);
      setStreamingEvent({ story: "", title: "", choices: [] });
    }
  }

  async function loadLife(lifeId: string) {
    setIsBooting(true);
    setBootError("");
    try {
      const response = await fetch(`${API_BASE}/api/life/${encodeURIComponent(lifeId)}`);
      if (response.status === 401) {
        router.replace(`/login?returnTo=${encodeURIComponent(`${LOGIN_RETURN_TO}?life=${lifeId}`)}`);
        return;
      }
      if (!response.ok) {
        if (response.status === 404 || response.status === 403) forgetActiveLife();
        setBootError(response.status === 404 || response.status === 403 ? "这局人生不存在，或你没有访问权限。" : "服务暂时不可用，请重试恢复原进度。");
        return;
      }
      const payload = (await response.json()) as { state?: LifeState };
      if (!payload.state) {
        setBootError("暂未读到完整存档，请重试恢复原进度。");
        return;
      }
      if (payload.state.dead === true) {
        forgetActiveLife();
        router.replace(`/review/${encodeURIComponent(payload.state.lifeId)}`);
        return;
      }
      setLife(buildLifeView(payload.state));
      rememberActiveLife(payload.state.lifeId);
      startMusicIfEnabled();
    } catch {
      setBootError("恢复这局人生失败，请回到开始页重试。");
    } finally {
      setIsBooting(false);
    }
  }

  async function startPending(pending: PendingStart, config: ModelConfig) {
    const preview = previewStart(pending.selection);
    setLife({
      lifeId: "",
      age: preview.age,
      city: preview.city ?? "",
      occupation: "",
      family: "",
      finance: "",
      health: "",
      eventTitle: "",
      story: "",
      choices: [],
      scenario: preview.scenario,
      dead: false,
    });
    setIsBooting(false);
    const payload = await requestLife(`${API_BASE}/api/life/start`, { gender: pending.gender, ...pending.selection }, pending.key, config);
    if (!payload) {
      if (redirecting.current) return;
      setLife(null);
      setBootError(lastError.current || "开局没有完成，请回到开始页重新选择。");
      return;
    }
    const state = stateFromPayload(payload);
    if (!state) {
      setLife(null);
      setBootError("开局结果暂未确认，请重试恢复原进度。");
      return;
    }
    if (state.dead) {
      clearPendingStart();
      forgetActiveLife();
      router.replace(`/review/${encodeURIComponent(state.lifeId)}`);
      return;
    }
    const next = buildLifeView(state);
    setLife(next);
    rememberActiveLife(next.lifeId);
    clearPendingStart();
    startMusicIfEnabled();
  }

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    async function boot() {
      const config = await loadModelConfig();
      setModelConfig(config);
      const requested = new URLSearchParams(window.location.search).get("life");
      if (requested) {
        await loadLife(requested);
        return;
      }
      const pending = readPendingStart();
      if (pending) {
        await startPending(pending, config);
        return;
      }
      const active = readActiveLifeId();
      if (active) {
        await loadLife(active);
        return;
      }
      router.replace("/");
    }
    boot();
    // 启动只执行一次；依赖里的函数使用首屏状态即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function choose(choiceId: string) {
    if (!life || isLoading) return;
    const choice = life.choices.find((item) => item.id === choiceId);
    startMusicIfEnabled();
    const payload = await requestLife(`${API_BASE}/api/life/${encodeURIComponent(life.lifeId)}/next`, { choice, expectedEventId: life.eventId });
    if (!payload) return;
    if (isRecord(payload) && payload.ended === true) {
      forgetActiveLife();
      router.replace(`/review/${encodeURIComponent(life.lifeId)}`);
      return;
    }
    const state = stateFromPayload(payload);
    if (!state) return;
    const next = buildLifeView(state);
    setLife(next);
    rememberActiveLife(next.lifeId);
  }

  async function continueLife() {
    if (!life || isLoading) return;
    startMusicIfEnabled();
    const payload = await requestLife(`${API_BASE}/api/life/${encodeURIComponent(life.lifeId)}/next`, { expectedEventId: life.eventId });
    if (!payload) return;
    if (isRecord(payload) && payload.ended === true) {
      forgetActiveLife();
      router.replace(`/review/${encodeURIComponent(life.lifeId)}`);
      return;
    }
    const state = stateFromPayload(payload);
    if (!state) return;
    const next = buildLifeView(state);
    setLife(next);
    rememberActiveLife(next.lifeId);
  }

  if (!life) {
    return (
      <main className="page page--event">
        <header className="topbar"><BrandLogo href="/" /></header>
        <div className="life-booting" role="status">
          <p className="eyebrow">{bootError ? "LIFE UNAVAILABLE" : "RETURNING TO YOUR LIFE"}</p>
          <p className="life-booting-title">{bootError ? "这一局没有接上。" : isBooting ? "正在回到这一局人生…" : "正在准备这一局人生…"}</p>
          <p className="life-booting-copy">{bootError || "如果加载时间过长，可以回到开始页，从「继续」重新进入。"}</p>
          {bootError && (readPendingStart() || readActiveLifeId()) ? <button className="settings-button" type="button" onClick={() => window.location.reload()}>重试恢复进度</button> : null}
          <Link className="settings-button" href="/">回到开始页</Link>
        </div>
      </main>
    );
  }

  const modeMeta = getScenarioLabel(life.scenario);
  const displayAge = isLoading && typeof streamingEvent.timePassed === "number"
    ? life.age + streamingEvent.timePassed
    : life.age;

  return (
    <main className="page page--event">
      <header className="topbar topbar--event" aria-label="Primary navigation">
        <div className="event-mode">
          <span className="mode-chip">{modeMeta.label}</span>
          <span className="event-mode-detail">{modeMeta.detail}{life.city ? ` · ${life.city}` : ""}</span>
        </div>
        <p className="current-age">{displayAge} 岁</p>
        <div className="topbar-actions"><AccountNav>
          <MusicToggle enabled={musicEnabled} supported={music.supported} onToggle={toggleMusic} compact />
        </AccountNav></div>
      </header>

      {requestError && <p className="request-error" role="alert">{requestError}</p>}

      <section className="life-event" aria-labelledby="event-title" aria-busy={isLoading}>
        <div className="event-story">
          <div className="event-body" aria-live="polite">
            {(isLoading ? streamingEvent.story : life.story).split("\n\n").filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
            {isLoading && !streamingEvent.story && <span className="story-cursor" aria-label="正在生成" />}
          </div>
          <p className="event-tagline" id="event-title">
            {(() => {
              const title = isLoading ? streamingEvent.title : life.eventTitle;
              return title ? `“${title}”` : "";
            })()}
          </p>
        </div>
        <div className="decision-area" aria-label="人生决策" hidden={isLoading && streamingEvent.outcome === "death"}>
          {life.age < CHILDHOOD_BOUNDARY ? (
            <>
              <p className="decision-label">命运在继续。</p>
              <div className="choice-cards">
                {[0, 1, 2].map((index) => (
                  <div className="choice-card choice-card--placeholder" key={index} aria-hidden="true">
                    <span className="choice-card-back">?</span>
                  </div>
                ))}
              </div>
              <button className="continue-button" onClick={continueLife} disabled={isLoading}>
                {isLoading ? "命运正在展开…" : "继续"}
              </button>
            </>
          ) : (
            <>
              <p className="decision-label">做出你的选择。</p>
              <div className="choice-cards">
                {["A", "B", "C"].map((id, index) => {
                  const choice = isLoading ? streamingEvent.choices[index] : life.choices[index];
                  return (
                    <button className={`choice-card ${choice ? "choice-card--revealed" : ""}`} key={id} disabled={!choice || isLoading} onClick={() => choice && choose(choice.id)}>
                      <span className="choice-card-back" aria-hidden="true">?</span>
                      <span className="choice-card-front"><small>{choice?.id ?? id}</small><strong>{`“${choice?.text ?? ""}”`}</strong><b aria-hidden="true">↗</b></span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <button className="rebirth-button" onClick={() => setShowExitDialog(true)} type="button">重生</button>
        </div>
      </section>

      {showExitDialog && (
        <div className="gender-modal" role="dialog" aria-modal="true" aria-label="离开当前人生" onClick={(event) => { if (event.target === event.currentTarget) setShowExitDialog(false); }}>
          <div className="gender-modal-card life-exit-card">
            <h2>离开当前人生？</h2>
            <p>进度已保存，可随时继续。</p>
            <div className="exit-actions">
              <button className="primary-button" type="button" onClick={() => setShowExitDialog(false)}>继续当前人生</button>
              <button className="text-button" type="button" onClick={() => router.push("/")}>离开</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
