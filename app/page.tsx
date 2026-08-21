"use client";

import { useState } from "react";
import { MODEL_PROVIDERS } from "../lib/provider-catalog";
import { BrandLogo } from "../components/BrandLogo";
import { parseSseMessages } from "../lib/sse";
import { readStreamedEvent, type StreamedEvent } from "../lib/stream-event";
import type { Gender } from "../lib/life";

type Phase = "start" | "birth" | "event" | "review";

type Choice = { id: string; text: string };

type LifeData = {
  lifeId: string;
  age: number;
  city: string;
  occupation: string;
  family: string;
  finance: string;
  health: string;
  eventTitle: string;
  story: string;
  choices: Choice[];
};

type Review = {
  age: number;
  death: string;
  facts: string[];
  moments: string[];
  observation: string;
};

type ModelConfig = {
  providerId: string;
  apiKey: string;
  model: string;
};

const LIFE_REQUEST_TIMEOUT_MS = 90_000;
const CHILDHOOD_BOUNDARY = 15;

// 部署在 findfire.club/findjoy 子路径下；客户端 fetch 不会自动带 basePath，需手动加前缀
const API_BASE = "/findjoy";

type LifeSummary = {
  lifeId: string;
  age: number;
  city: string;
  events: number;
  dead: boolean;
  updatedAt: string;
};

// 生产固定配置：DeepSeek deepseek-v4-flash，Key 由服务端环境变量提供（前端不收集）
const defaultModelConfig: ModelConfig = {
  providerId: "deepseek",
  apiKey: "",
  model: "deepseek-v4-flash",
};

const demoLife: LifeData = {
  lifeId: "demo-life",
  age: 0,
  city: "深圳",
  occupation: "婴儿",
  family: "与家人共同生活",
  finance: "由家庭照料",
  health: "正在成长",
  eventTitle: "你的童年开始了",
  story: "你第一次睁开眼，看见家人为你忙碌。世界还很大，而你正慢慢学会用自己的方式认识它。",
  choices: [
    { id: "A", text: "顺着眼前的变化慢慢适应" },
    { id: "B", text: "在熟悉的节奏里再停留一会儿" },
    { id: "C", text: "试着用自己的方式回应" },
  ],
};

const demoReview: Review = {
  age: 82,
  death: "在很深的年纪平静离世",
  facts: ["经历过不同的工作与生活阶段", "拥有过重要的关系与告别", "在几座城市留下自己的日常"],
  moments: [
    "你第一次意识到，选择本身也会改变你。",
    "你在一个艰难的阶段重新安排了生活的重心。",
    "你经历挫折后，没有立刻给自己新的答案。",
    "你在一次告别中，看见了关系留下的重量。",
  ],
  observation:
    "从你的选择来看，你常常会在真正重要的时刻为关系停下来。年轻时，你也许很在意证明自己；后来，你似乎越来越愿意把时间留给那些无法替代的人和事。",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function getChoices(value: unknown): Choice[] {
  // 真实事件里拿到多少选项就展示多少，绝不用 demo 文案顶替——
  // 否则会出现“本该是模型给的选项，却突然变成演示选项”的卡片跳变。
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.text !== "string") return [];
    return [{ id: getString(item.id, String.fromCharCode(65 + index)), text: item.text }];
  });
}

function parseLife(payload: unknown): LifeData {
  if (!isRecord(payload)) return demoLife;
  const state = isRecord(payload.state) ? payload.state : payload;
  const basic = isRecord(state.basic) ? state.basic : {};
  const career = isRecord(state.career) ? state.career : {};
  const finance = isRecord(state.finance) ? state.finance : {};
  const health = isRecord(state.health) ? state.health : {};
  const relationships = isRecord(state.relationships) ? state.relationships : {};
  const partner = isRecord(relationships.partner) ? relationships.partner : {};
  const nextEvent = isRecord(payload.event) ? payload.event : {};
  const event = isRecord(nextEvent.event) ? nextEvent.event : nextEvent;
  return {
    ...demoLife,
    lifeId: getString(state.lifeId, demoLife.lifeId),
    age: typeof basic.age === "number" ? basic.age : demoLife.age,
    city: getString(basic.city, demoLife.city),
    occupation: getString(career.occupation, demoLife.occupation),
    family: getString(partner.status, demoLife.family),
    finance: getString(finance.housing, demoLife.finance),
    health: getString(health.lifestyle, demoLife.health),
    eventTitle: getString(event.title, demoLife.eventTitle),
    story: getString(nextEvent.story, demoLife.story),
    choices: getChoices(nextEvent.choices),
  };
}

function parseReview(payload: unknown, current: LifeData): Review {
  if (!isRecord(payload) || !isRecord(payload.ending)) return demoReview;
  const ending = payload.ending;
  const facts = isRecord(ending.facts) ? ending.facts : {};
  const highlights = Array.isArray(ending.highlights) ? ending.highlights : [];
  const patterns = Array.isArray(ending.patterns) ? ending.patterns : [];
  const moments = highlights.flatMap((item) => {
    if (!isRecord(item)) return [];
    const age = typeof item.age === "number" ? `${item.age} 岁，` : "";
    const title = getString(item.title, "一次重要的选择");
    return [`${age}${title}。`];
  });
  const eventCount = typeof facts.events === "number" ? `经历 ${facts.events} 个重要人生事件` : "经历许多重要的选择";
  return {
    age: typeof ending.age === "number" ? ending.age : demoReview.age,
    death: getString(ending.death, demoReview.death),
    facts: [getString(facts.occupation, current.occupation), `在${getString(facts.city, current.city)}生活过`, eventCount],
    moments: moments.length ? moments : demoReview.moments,
    observation: patterns.filter((item): item is string => typeof item === "string").join(" ") || demoReview.observation,
  };
}

export default function Home() {
  const [phase, setPhase] = useState<Phase>("start");
  const [life, setLife] = useState<LifeData>(demoLife);
  const [review, setReview] = useState<Review>(demoReview);
  const [isLoading, setIsLoading] = useState(false);
  // 生产固定配置：始终使用默认的 DeepSeek deepseek-v4-flash（Key 由服务端环境变量提供）
  const [modelConfig] = useState<ModelConfig>(() => {
    if (typeof window === "undefined") return defaultModelConfig;
    return defaultModelConfig;
  });
  const [showSettings, setShowSettings] = useState(false);
  const [showGenderDialog, setShowGenderDialog] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [historyLives, setHistoryLives] = useState<LifeSummary[] | null>(null);
  const [historyDetail, setHistoryDetail] = useState<import("../lib/life").LifeState | null>(null);
  const [requestError, setRequestError] = useState("");
  const [streamingEvent, setStreamingEvent] = useState<StreamedEvent>({ story: "", title: "", choices: [] });

  // timePassed 是流式 JSON 的第一个字段：一旦到达，顶栏年龄立即显示落地年龄（旧年龄 + timePassed），
  // 不必等整段 story/choices 流完；落地年龄与 life.ts 的 applyNextEvent 保持一致（上限 110 岁）。
  const displayAge = isLoading && typeof streamingEvent.timePassed === "number"
    ? Math.min(110, life.age + streamingEvent.timePassed)
    : life.age;

  async function requestLife(url: string, body?: Record<string, unknown>) {
    setIsLoading(true);
    setRequestError("");
    setStreamingEvent({ story: "", title: "", choices: [] });
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: AbortSignal.timeout(LIFE_REQUEST_TIMEOUT_MS),
        body: JSON.stringify({ ...(body ?? {}), modelConfig }),
      });
      if (!response.ok) throw new Error("Life service unavailable");
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
            // status 仅作服务端流式开始信号；不再下发背景/城市预览，直接进入事件页
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
            const payload = JSON.parse(message.data) as { error?: string };
            throw new Error(payload.error ?? "Life service unavailable");
          }
        }
      }
      throw new Error("Life stream ended before completion");
    } catch (error) {
      if (error instanceof DOMException && error.name === "TimeoutError") {
        setRequestError("模型响应超时（超过 90 秒），请稍后重试或更换模型。");
      } else {
        setRequestError(error instanceof Error && error.message ? error.message : "人生服务暂时不可用，请检查模型设置后重试。");
      }
      return null;
    } finally {
      setIsLoading(false);
      setStreamingEvent({ story: "", title: "", choices: [] });
    }
  }

  async function startLife(gender: Gender) {
    setShowGenderDialog(false);
    setPhase("event");
    const payload = await requestLife(`${API_BASE}/api/life/start`, { gender });
    if (!payload) {
      setPhase("start");
      return;
    }
    setLife(parseLife(payload));
  }

  async function choose(choiceId: string) {
    const choice = life.choices.find((item) => item.id === choiceId);
    const payload = await requestLife(`${API_BASE}/api/life/${life.lifeId}/next`, { choice });
    if (isRecord(payload) && payload.ended === true) {
      const ending = await requestLife(`${API_BASE}/api/life/${life.lifeId}/ending`);
      setReview(parseReview(ending, life));
      setPhase("review");
    } else if (payload) {
      setLife(parseLife(payload));
    }
  }

  async function continueLife() {
    const payload = await requestLife(`${API_BASE}/api/life/${life.lifeId}/next`);
    if (isRecord(payload) && payload.ended === true) {
      const ending = await requestLife(`${API_BASE}/api/life/${life.lifeId}/ending`);
      setReview(parseReview(ending, life));
      setPhase("review");
    } else if (payload) {
      setLife(parseLife(payload));
    }
  }

  function restart() {
    setLife(demoLife);
    setReview(demoReview);
    setPhase("start");
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
      const payload = (await response.json()) as { state?: import("../lib/life").LifeState };
      if (payload.state) setHistoryDetail(payload.state);
    } catch { /* keep list visible */ }
  }

  return (
    <main className={`page page--${phase}`}>
      <header className="topbar" aria-label="Primary navigation">
        {phase === "event" ? <p className="current-age">{displayAge} 岁</p> : <><BrandLogo className="wordmark" onClick={restart} /><div className="topbar-actions"><button className="settings-button" onClick={openHistory}>过往人生</button><button className="settings-button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>模型设置</button></div></>}
      </header>

      {showSettings && (
        <>
        <div className="modal-scrim" onClick={() => setShowSettings(false)} aria-hidden="true" />
        <section className="settings-panel" aria-label="模型设置">
          <div className="settings-head"><p className="eyebrow">MODEL CONNECTION</p><button className="settings-close" onClick={() => setShowSettings(false)} aria-label="关闭模型设置">×</button></div>
          <p className="settings-note">系统固定使用 DeepSeek deepseek-v4-flash 模型，API Key 由服务端统一配置，无需填写。</p>
          <label>供应商<select value={modelConfig.providerId} disabled>{MODEL_PROVIDERS.filter((provider) => provider.id === "deepseek").map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
          <label>模型<select value="deepseek-v4-flash" disabled><option value="deepseek-v4-flash">DeepSeek V4 Flash（默认）</option></select></label>
          <label>API Key<input type="password" value="server-managed" placeholder="由服务端统一配置" disabled autoComplete="off" /></label>
        </section>
        </>
      )}

      {requestError && <p className="request-error" role="alert">{requestError}</p>}

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
                <p className="history-detail-meta">{historyDetail.basic.city} · {historyDetail.basic.age} 岁 · {historyDetail.history.length} 个节点{historyDetail.dead ? " · 已故" : " · 在世"}
                  {(() => {
                    const bg = [historyDetail.flags.bgEconomy, historyDetail.flags.bgStructure, historyDetail.flags.bgEvent, historyDetail.flags.bgTalent].filter((v): v is string => typeof v === "string");
                    return bg.length === 4 ? ` · 出身 ${bg.join("·")}` : "";
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
                      <button className="history-item" key={item.lifeId} onClick={() => loadLifeDetail(item.lifeId)}>
                        <span className="history-item-time">{new Date(item.updatedAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</span>
                        <span className="history-item-main">{item.city} · {item.age} 岁 · {item.events} 个节点</span>
                        <span className={`history-item-status ${item.dead ? "is-dead" : ""}`}>{item.dead ? "已故" : "在世"}</span>
                      </button>
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
              <button className="gender-option" type="button" onClick={() => startLife("female")} aria-label="选择女性">
                <svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="7" r="4.2" />
                  <path d="M12 11.2V21M8.6 16.8h6.8" />
                </svg>
              </button>
              <button className="gender-option" type="button" onClick={() => startLife("male")} aria-label="选择男性">
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

      {phase === "start" && (
        <section className="intro" aria-labelledby="intro-title">
          <p className="eyebrow">FIND YOUR WAY TO JOY</p>
          <h1 id="intro-title">人生没有答案，只有选择</h1>
          <p className="intro-copy"><span>这一生会从这里开始，而幸福不在别处，就在你的每一次选择里。</span><span className="intro-copy-line--nowrap">阿德勒说，决定我们的不是经历，而是我们赋予经历的意义——没有统一标准，你怎样定义，就有怎样的幸福。</span><span>直到终点回望时，你看见它如何一点点，变成了你自己。</span></p>
          <button className="primary-button" onClick={() => setShowGenderDialog(true)} disabled={isLoading}>
            {isLoading ? "正在开始..." : "开始人生"}
          </button>
        </section>
      )}

      {phase === "event" && (
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
          <div className="decision-area" aria-label="人生决策">
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
            <button className="rebirth-button" onClick={restart} type="button">重生</button>
          </div>
        </section>
      )}

      {phase === "review" && (
        <section className="review" aria-labelledby="review-title">
          <p className="eyebrow">A LIFE REMEMBERED</p>
          <h1 id="review-title">你的<br />一生。</h1>
          <p className="lived">享年 <strong>{review.age}</strong> 岁<span className="death-cause">，{review.death}</span></p>
          <div className="review-section facts"><p className="section-label">这一生</p>{review.facts.map((fact) => <p key={fact}>{fact}</p>)}</div>
          <div className="review-section"><p className="section-label">改变方向的时刻</p>{review.moments.map((moment) => <p className="moment" key={moment}>{moment}</p>)}</div>
          <div className="reflection"><p className="section-label">回望</p><p>{review.observation}</p></div>
          <div className="final-question"><p>如果这是你真实的一生，<br />你愿意这样活吗？</p><div><button className="text-button" onClick={restart}>我愿意。</button><button className="primary-button" onClick={restart}>我想再活一次 <span aria-hidden="true">↗</span></button></div></div>
        </section>
      )}
    </main>
  );
}
