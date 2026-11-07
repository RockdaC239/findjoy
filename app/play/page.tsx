"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import farewellStyles from "../../components/Farewell.module.css";
import { DeveloperDebugButton } from "../../components/DeveloperMode";
import { LifeEventScene } from "../../components/LifeEventScene";
import { NarrationScene } from "../../components/NarrationScene";
import { CHILDHOOD_BOUNDARY } from "../../lib/engine/phase";
import { AccountNav } from "../../components/AccountNav";
import { BrandLogo } from "../../components/BrandLogo";
import { MusicToggle } from "../../components/MusicToggle";
import { parseSseMessages } from "../../lib/sse";
import { readStreamedEvent, type StreamedEvent } from "../../lib/stream-event";
import { buildLifeView, type LifeView } from "../../lib/life-view";
import type { LifeState } from "../../lib/life";
import { useAmbientMusic } from "../../lib/use-ambient-music";
import { MUSIC_UI_ENABLED } from "../../lib/feature-flags";
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
  readLifeScene,
  rememberLifeScene,
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
  const [decisionEventId, setDecisionEventId] = useState<string | null>(null);
  const [narrationAttempt, setNarrationAttempt] = useState(0);
  const [isBooting, setIsBooting] = useState(true);
  const [bootError, setBootError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [enteringFarewell, setEnteringFarewell] = useState(false);
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
    // 音乐未完成时入口隐藏，也不能自动播放，否则玩家没有开关可关。
    if (!MUSIC_UI_ENABLED) return;
    if (musicEnabled) music.start();
  }

  function receiveLifePayload(payload: unknown) {
    const state = stateFromPayload(payload);
    if (redirecting.current) {
      if (state && !state.dead) rememberActiveLife(state.lifeId);
      return null;
    }
    if (state && !state.dead) restoreView(state);
    if (state?.experienceVersion !== 3 && (state?.dead || (isRecord(payload) && payload.ended === true))) setEnteringFarewell(true);
    return payload;
  }

  function restoreView(state: LifeState) {
    const view = buildLifeView(state);
    setLife(view);
    setDecisionEventId(!view.openingRecovery && view.eventId && readLifeScene(view.lifeId, view.eventId) === "decision" ? view.eventId : null);
    rememberActiveLife(view.lifeId);
  }

  async function requestLife(url: string, body?: Record<string, unknown>, idempotencyKey?: string, config?: ModelConfig): Promise<unknown | null> {
    setNarrationAttempt(value => value + 1);
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
        if (!redirecting.current) router.replace(`/login?returnTo=${encodeURIComponent(LOGIN_RETURN_TO)}`);
        redirecting.current = true;
        return null;
      }
      if (response.status === 402) {
        if (!redirecting.current) router.replace("/plans");
        redirecting.current = true;
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
            if (result.status === "complete" && result.state) return receiveLifePayload({ state: result.state });
            if (result.status === "failed") { clearPendingStart(); break; }
          }
        }
        discardPendingStartOnError(payload?.code);
        throw new Error(payload?.error || "人生服务暂时不可用，请稍后重试。");
      }
      if (response.headers.get("content-type")?.includes("application/json")) return receiveLifePayload(await response.json());
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
              const event = readStreamedEvent(generated);
              if (event.outcome === "death" && life?.experienceVersion !== 3) setEnteringFarewell(true);
              setStreamingEvent(event);
            }
          } else if (message.event === "retry") {
            setNarrationAttempt(value => value + 1);
            generated = "";
            setEnteringFarewell(false);
            setStreamingEvent({ story: "", title: "", choices: [] });
          } else if (message.event === "complete") {
            return receiveLifePayload(JSON.parse(message.data));
          } else if (message.event === "error") {
            const payload = JSON.parse(message.data) as { error?: string; code?: string };
            discardPendingStartOnError(payload.code);
            throw new Error(payload.error ?? "Life service unavailable");
          }
        }
      }
      throw new Error("Life stream ended before completion");
    } catch (error) {
      setEnteringFarewell(false);
      // 响应丢失时先核对已保存节点，避免把同一选择再次提交给模型。
      if (life?.lifeId && typeof body?.expectedEventId === "string") {
        try {
          const recovered = await fetch(`${API_BASE}/api/life/${encodeURIComponent(life.lifeId)}`, { signal: AbortSignal.timeout(5000) });
          const state = recovered.ok ? stateFromPayload(await recovered.json()) : null;
          if (state && state.history.at(-1)?.id !== body.expectedEventId) {
            setRequestError("");
            return receiveLifePayload({ state, ended: state.dead });
          }
        } catch { /* 保留原错误，用户可手动恢复最新存档。 */ }
      }
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
        setEnteringFarewell(true);
        forgetActiveLife();
        router.replace(`/review/${encodeURIComponent(payload.state.lifeId)}`);
        return;
      }
      restoreView(payload.state);
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
      experienceVersion: 3,
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
    if (!choice) return;
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
    if (state.dead) {
      forgetActiveLife();
      router.replace(`/review/${encodeURIComponent(state.lifeId)}`);
      return;
    }
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
  }

  if (enteringFarewell) return <main className={farewellStyles.farewell} aria-label="正在进入人生告别" aria-busy="true" />;

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
  const narrating = life.experienceVersion === 3 && (life.openingRecovery || isLoading || decisionEventId !== life.eventId);
  const opening = narrating && (life.scenario.mode === "normal" || life.scenario.mode === "theme")
    && (isLoading ? !life.lifeId || life.openingRecovery : (life.fromAge ?? life.age) < CHILDHOOD_BOUNDARY && life.age <= CHILDHOOD_BOUNDARY);
  const displayAge = isLoading && typeof streamingEvent.timePassed === "number"
    ? life.age + streamingEvent.timePassed
    : life.age;

  return (
    <main className="page page--event">
      <header className="topbar topbar--event" aria-label="Primary navigation">
        <div className="event-mode">
          <span className="mode-chip">{modeMeta.label}</span>
          <span className="event-mode-detail">{modeMeta.detail}{!narrating && life.city ? ` · ${life.city}` : ""}</span>
        </div>
        <p className="current-age">{opening ? "开篇" : narrating ? "这一段人生" : `${displayAge} 岁`}</p>
        <div className="topbar-actions">
          <AccountNav showRecharge={false} collapseOnMobile>
            <Link className="settings-button" href="/">回到主页</Link>
            <DeveloperDebugButton />
            {MUSIC_UI_ENABLED && <MusicToggle enabled={musicEnabled} supported={music.supported} onToggle={toggleMusic} compact />}
          </AccountNav>
        </div>
      </header>

      {requestError && <div className="request-error" role="alert"><p>{requestError}</p><button className="text-button" type="button" onClick={() => loadLife(life.lifeId)}>恢复最新进度</button></div>}
      {life.openingRecovery && !isLoading && <p className="settings-note" role="status">这局开篇未完整生成。已有经历已保留，可以接着讲完童年。</p>}

      {narrating ? <NarrationScene
        key={narrationAttempt}
        story={isLoading ? streamingEvent.narration ?? "" : life.narration ?? ""}
        ready={!isLoading && !!life.eventId}
        continueLabel={life.openingRecovery ? "接着讲完童年" : "进入下一幕"}
        onContinue={() => {
          if (!life.eventId || isLoading) return;
          if (life.openingRecovery) { void continueLife(); return; }
          rememberLifeScene(life.lifeId, life.eventId, "decision");
          setDecisionEventId(life.eventId);
          window.scrollTo({ top: 0, behavior: "instant" });
        }}
      /> : <LifeEventScene life={life} isLoading={isLoading} streamingEvent={streamingEvent} onChoose={choose} onContinue={continueLife} onExit={() => setShowExitDialog(true)} />}

      {showExitDialog && (
        <div className="gender-modal" role="dialog" aria-modal="true" aria-label="离开当前人生" onClick={(event) => { if (event.target === event.currentTarget) setShowExitDialog(false); }}>
          <div className="gender-modal-card life-exit-card">
            <h2>离开当前人生？</h2>
            <p>{isLoading ? "故事仍在生成，离开后可从主页恢复进度。" : "进度已保存，可随时继续。"}</p>
            <div className="exit-actions">
              <button className="primary-button" type="button" onClick={() => setShowExitDialog(false)}>继续当前人生</button>
              <button className="text-button" type="button" onClick={() => { redirecting.current = true; router.push("/"); }}>离开</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
