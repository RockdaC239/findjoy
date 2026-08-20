"use client";

import { useState } from "react";
import { getProvider, MODEL_PROVIDERS } from "../lib/provider-catalog";
import { BrandLogo } from "../components/BrandLogo";
import { parseSseMessages } from "../lib/sse";
import { readStreamedEvent, type StreamedChoice } from "../lib/stream-event";

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
  background: string;
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

type ModelOption = { id: string; label: string };

const MODEL_CONFIG_STORAGE_KEY = "findjoy:model-config";
const REMOTE_MODELS_STORAGE_KEY = "findjoy:remote-models";
const LIFE_REQUEST_TIMEOUT_MS = 90_000;

const defaultModelConfig: ModelConfig = {
  providerId: "openai",
  apiKey: "",
  model: "gpt-4o-mini",
};

function loadRemoteModels(): Record<string, ModelOption[]> {
  if (typeof window === "undefined") return {};
  try {
    const saved = JSON.parse(window.localStorage.getItem(REMOTE_MODELS_STORAGE_KEY) ?? "{}");
    if (!saved || typeof saved !== "object") return {};
    return Object.fromEntries(Object.entries(saved).map(([providerId, models]) => [providerId, Array.isArray(models) ? models.filter((model): model is ModelOption => Boolean(model) && typeof model === "object" && typeof (model as ModelOption).id === "string" && typeof (model as ModelOption).label === "string") : []]));
  } catch {
    return {};
  }
}

const demoLife: LifeData = {
  lifeId: "demo-life",
  age: 0,
  city: "深圳",
  occupation: "婴儿",
  family: "与家人共同生活",
  finance: "由家庭照料",
  health: "正在成长",
  background:
    "你来到一个普通的家庭。有人为你的到来忙碌，也有人在窗边默默看着你。此刻的世界还没有答案，只有漫长而未知的日子。",
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
  if (!Array.isArray(value)) return demoLife.choices;
  const choices = value.flatMap((item, index) => {
    if (!isRecord(item) || typeof item.text !== "string") return [];
    return [{ id: getString(item.id, String.fromCharCode(65 + index)), text: item.text }];
  });
  return choices.length >= 2 ? choices : demoLife.choices;
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
    background: getString(payload.background, demoLife.background),
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
  const [selectedChoice, setSelectedChoice] = useState<string | null>(null);
  const [modelConfig, setModelConfig] = useState<ModelConfig>(() => {
    if (typeof window === "undefined") return defaultModelConfig;
    try {
      const saved = window.localStorage.getItem(MODEL_CONFIG_STORAGE_KEY);
      return saved ? { ...defaultModelConfig, ...JSON.parse(saved) } : defaultModelConfig;
    } catch { return defaultModelConfig; }
  });
  const [showSettings, setShowSettings] = useState(false);
  const [remoteModels, setRemoteModels] = useState<Record<string, ModelOption[]>>(loadRemoteModels);
  const [isRefreshingModels, setIsRefreshingModels] = useState(false);
  const [modelRefreshMessage, setModelRefreshMessage] = useState("");
  const [requestError, setRequestError] = useState("");
  const [streamingEvent, setStreamingEvent] = useState({ story: "", title: "", choices: [] as StreamedChoice[] });
  const selectedProvider = getProvider(modelConfig.providerId) ?? MODEL_PROVIDERS[0];
  const listedModels = remoteModels[selectedProvider.id] ?? selectedProvider.models;
  const availableModels = listedModels.some((model) => model.id === modelConfig.model) ? listedModels : [{ id: modelConfig.model, label: `${modelConfig.model}（当前选择）` }, ...listedModels];

  function updateModelConfig<K extends keyof ModelConfig>(key: K, value: ModelConfig[K]) {
    const next = { ...modelConfig, [key]: value };
    setModelConfig(next);
    try { window.localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }

  function selectProvider(providerId: string) {
    const provider = getProvider(providerId) ?? MODEL_PROVIDERS[0];
    const models = remoteModels[provider.id] ?? provider.models;
    const next = { ...modelConfig, providerId: provider.id, model: models[0].id };
    setModelConfig(next);
    try { window.localStorage.setItem(MODEL_CONFIG_STORAGE_KEY, JSON.stringify(next)); } catch { /* Storage is optional. */ }
  }

  async function refreshModels() {
    if (!modelConfig.apiKey) {
      setModelRefreshMessage("请先填写 API Key");
      return;
    }
    setIsRefreshingModels(true);
    setModelRefreshMessage("");
    try {
      const response = await fetch("/api/models", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ providerId: modelConfig.providerId, apiKey: modelConfig.apiKey }) });
      const payload = (await response.json()) as { models?: ModelOption[]; error?: string };
      if (!response.ok || !payload.models?.length) throw new Error(payload.error ?? "未读取到模型");
      setRemoteModels((current) => {
        const next = { ...current, [modelConfig.providerId]: payload.models ?? [] };
        window.localStorage.setItem(REMOTE_MODELS_STORAGE_KEY, JSON.stringify(next));
        return next;
      });
      setModelRefreshMessage(`已读取 ${payload.models.length} 个可用模型`);
    } catch (error) {
      setModelRefreshMessage(error instanceof Error ? error.message : "读取模型列表失败");
    } finally {
      setIsRefreshingModels(false);
    }
  }

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
            const status = JSON.parse(message.data) as { preview?: { story?: string; title?: string; choices?: StreamedChoice[]; background?: string } };
            if (status.preview) {
              const background = status.preview.background;
              setStreamingEvent({ story: status.preview.story ?? "", title: status.preview.title ?? "", choices: status.preview.choices ?? [] });
              if (background) {
                setLife((current) => ({ ...current, background }));
                setPhase("birth");
                setSelectedChoice(null);
              }
            }
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

  async function startLife() {
    setSelectedChoice("starting");
    const payload = await requestLife("/api/life/start");
    setSelectedChoice(null);
    if (!payload) {
      setPhase("start");
      return;
    }
    setLife(parseLife(payload));
    // 若用户已在 status 阶段进入事件页（background 先到），complete 后保持事件页
    setPhase((current) => (current === "event" ? current : "birth"));
  }

  async function choose(choiceId: string) {
    setSelectedChoice(choiceId);
    const choice = life.choices.find((item) => item.id === choiceId);
    const payload = await requestLife(`/api/life/${life.lifeId}/next`, { choice });
    if (isRecord(payload) && payload.ended === true) {
      const ending = await requestLife(`/api/life/${life.lifeId}/ending`);
      setReview(parseReview(ending, life));
      setPhase("review");
    } else if (payload) {
      setLife(parseLife(payload));
    }
    setSelectedChoice(null);
  }

  function restart() {
    setLife(demoLife);
    setReview(demoReview);
    setPhase("start");
  }

  return (
    <main className={`page page--${phase}`}>
      <header className="topbar" aria-label="Primary navigation">
        {phase === "event" ? <p className="current-age">{life.age} 岁</p> : <><BrandLogo className="wordmark" onClick={restart} /><button className="settings-button" onClick={() => setShowSettings((value) => !value)} aria-expanded={showSettings}>模型设置</button></>}
      </header>

      {showSettings && (
        <section className="settings-panel" aria-label="模型设置">
          <div className="settings-head"><p className="eyebrow">MODEL CONNECTION</p><button className="settings-close" onClick={() => setShowSettings(false)} aria-label="关闭模型设置">×</button></div>
          <p className="settings-note">只需选择供应商、模型并填写 Key。接口地址和计费规则由系统自动配置，设置保存在当前浏览器。</p>
          <label>供应商<select value={modelConfig.providerId} onChange={(event) => selectProvider(event.target.value)}>{MODEL_PROVIDERS.map((provider) => <option key={provider.id} value={provider.id}>{provider.label}</option>)}</select></label>
          <label>模型<select value={modelConfig.model} onChange={(event) => updateModelConfig("model", event.target.value)}>{availableModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
          <label>API Key<input type="password" value={modelConfig.apiKey} onChange={(event) => updateModelConfig("apiKey", event.target.value)} placeholder="粘贴该供应商的 API Key" autoComplete="off" /></label>
          <button className="refresh-models" type="button" onClick={refreshModels} disabled={isRefreshingModels}>{isRefreshingModels ? "正在读取模型..." : "刷新该供应商的最新模型"}</button>
          {modelRefreshMessage && <p className="settings-status" role="status">{modelRefreshMessage}</p>}
        </section>
      )}

      {requestError && <p className="request-error" role="alert">{requestError}</p>}

      {phase === "start" && (
        <section className="intro" aria-labelledby="intro-title">
          <p className="eyebrow">FIND YOUR WAY TO JOY</p>
          <h1 id="intro-title">人生没有答案，只有选择</h1>
          <p className="intro-copy">系统会讲述你的故事，你来决定它意味着什么。</p>
          <button className="primary-button" onClick={startLife} disabled={isLoading}>
            {isLoading ? "正在开始..." : "开始人生"}
          </button>
        </section>
      )}

      {phase === "birth" && (
        <section className="birth" aria-labelledby="birth-title">
          <div className="age-mark">0</div>
          <p className="eyebrow">FROM THE BEGINNING</p>
          <h1 id="birth-title">你，<br />欢迎来到人间。</h1>
          <div className="birth-grid">
            <div className="story-copy"><p>{life.background}</p></div>
            <dl className="life-facts">
              <div><dt>起点</dt><dd>{life.city}</dd></div>
              <div><dt>阶段</dt><dd>出生</dd></div>
              <div><dt>此刻</dt><dd>童年将要开始</dd></div>
            </dl>
          </div>
          <button className="primary-button" onClick={() => setPhase("event")}>走进这一生 <span aria-hidden="true">↗</span></button>
        </section>
      )}

      {phase === "event" && (
        <section className="life-event" aria-labelledby="event-title" aria-busy={isLoading}>
          <div className="event-story">
            <p className="event-kicker">{isLoading ? "人生正在展开" : life.occupation}</p>
            <h1 id="event-title">{isLoading ? streamingEvent.title || "" : life.eventTitle}</h1>
            <div className="event-body" aria-live="polite">
              {(isLoading ? streamingEvent.story : life.story).split("\n\n").filter(Boolean).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              {isLoading && !streamingEvent.story && <span className="story-cursor" aria-label="正在生成" />}
            </div>
          </div>
          <div className="decision-area" aria-label="人生决策">
            <p className="decision-label">你的决定</p>
            <div className="choice-cards">
              {["A", "B", "C"].map((id, index) => {
                const choice = isLoading ? streamingEvent.choices[index] : life.choices[index];
                return (
                  <button className={`choice-card ${choice ? "choice-card--revealed" : ""}`} key={id} disabled={!choice || isLoading} onClick={() => choice && choose(choice.id)}>
                    <span className="choice-card-back">{id}</span>
                    <span className="choice-card-front"><small>{choice?.id ?? id}</small><strong>{selectedChoice === choice?.id ? "人生正在继续" : choice?.text}</strong><b aria-hidden="true">↗</b></span>
                  </button>
                );
              })}
            </div>
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
