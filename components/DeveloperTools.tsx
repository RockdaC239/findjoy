"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BrandLogo } from "./BrandLogo";
import { LifeEventScene } from "./LifeEventScene";
import { Farewell } from "./Farewell";
import { ReviewExperience } from "./ReviewExperience";
import { ReviewView } from "./ReviewView";
import type { LifeView } from "../lib/life-view";
import type { Review } from "../lib/review";
import { API_BASE } from "../lib/life-session";
import styles from "./DeveloperTools.module.css";

const stages = ["出生与早年", "童年节点", "成年选择", "事件生成中", "告别与回顾", "等待回顾", "回顾生成失败", "人生回顾"];
const story = "你八十一岁，清晨的光落在窗沿。家人坐在身边，你听见他们轻声说话。你慢慢闭上眼睛，这一生停在一个安静的早晨。";
const review: Review = { age: 81, death: "自然离世", facts: ["做过教师，也尝试过经营一家书店", "在成都生活过", "经历 24 个重要人生事件"], moments: ["22 岁，你第一次站上讲台。", "36 岁，你选择回到家人身边。", "60 岁，你把小书店交给年轻人。"], observation: "从你的选择来看，你似乎一直在尝试，为重要的人和自己的愿望留出位置。", question: "如果这是你真实的一生，你愿意这样活吗？", modeLabel: "普通模式", modeDetail: "合成调试样例" };

export function DeveloperTools({ initialBalance }: { initialBalance: number }) {
  const [stage, setStage] = useState("告别与回顾");
  const [replay, setReplay] = useState(0);
  const [balance, setBalance] = useState(initialBalance);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [typed, setTyped] = useState(0);
  const [grantKey, setGrantKey] = useState("");
  const view = useMemo<LifeView>(() => ({ lifeId: "developer-synthetic", age: stage === "出生与早年" ? 0 : stage === "童年节点" ? 8 : 32, city: "成都", occupation: "教师", family: "与家人同住", finance: "租住", health: "普通", eventTitle: stage === "童年节点" ? "搬家后的第一天" : "一份外地工作的邀请", story: stage === "出生与早年" ? "你来到这个世界，家人轻轻把你抱在怀里。" : stage === "童年节点" ? "你八岁，跟着家人搬到一座新城市。陌生的教室里，有人挪了挪课桌，为你留出一个位置。" : "你三十二岁，一份外地工作的邀请摆在桌上。电话那头，家人问你周末是否回来吃饭。", choices: [{ id: "A", text: "接受邀请，去新的城市试试" }, { id: "B", text: "留在家人身边，继续现在的工作" }, { id: "C", text: "先谈谈远程工作的可能" }], scenario: { mode: "normal" }, dead: false }), [stage]);
  useEffect(() => {
    if (stage !== "事件生成中") return;
    const timer = window.setInterval(() => setTyped(value => Math.min(view.story.length, value + 2)), 100);
    return () => window.clearInterval(timer);
  }, [stage, view.story.length, replay]);
  function changeStage(value: string) { setStage(value); setTyped(0); setReplay(value => value + 1); }
  async function grant() {
    if (busy) return;
    const key = grantKey || crypto.randomUUID();
    setGrantKey(key); setBusy(true); setMessage("");
    try {
      const response = await fetch(`${API_BASE}/api/developer/credits`, { method: "POST", headers: { "Idempotency-Key": key }, signal: AbortSignal.timeout(10000) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "积分发放失败，请重试");
      setBalance(payload.balance.available); setGrantKey(""); setMessage("积分已到账，本次 +1000 积分");
    } catch (error) { setMessage(error instanceof Error ? error.message : "请求失败，请重试；重试不会重复发放"); }
    finally { setBusy(false); }
  }
  return <>
    <main className={styles.main}>
      <header className={styles.actions}><BrandLogo href="/" /><Link className="settings-button" href="/showcase">Showcase ↗</Link><Link className="settings-button" href="/plans">积分充值与测试支付 ↗</Link></header>
      <h1>个人调试</h1>
      <p>节点预览使用合成内容，不调用模型、不扣积分、不修改真实人生。</p>
      <div className={styles.tools}>
        <div className={styles.actions}><span>当前积分：{balance}</span><button className="primary-button" onClick={grant} disabled={busy} aria-busy={busy}>{busy ? "正在发放…" : "给自己增加 1000 积分"}</button></div>
        {message && <p className={styles.message} role="status">{message}</p>}
        <label>预览节点<select value={stage} onChange={event => changeStage(event.target.value)}>{stages.map(value => <option key={value}>{value}</option>)}</select><button className="settings-button" onClick={() => changeStage(stage)}>重新播放</button></label>
      </div>
    </main>
    <section className={styles.preview} aria-label="游戏节点预览" key={replay}>
      {stage === "告别与回顾" ? <ReviewExperience lifeId={view.lifeId} view={{ ...view, age: 81, dead: true }} story={story} cause="自然离世" initialReview={review} />
        : stage === "等待回顾" || stage === "回顾生成失败" ? <Farewell age={81} story={story} cause="自然离世" ready={false} error={stage === "回顾生成失败" ? "人生回顾暂未生成，请稍后重试" : ""} onContinue={() => changeStage("人生回顾")} onRetry={() => changeStage("告别与回顾")} />
          : stage === "人生回顾" ? <ReviewView lifeId={view.lifeId} view={{ ...view, age: 81, dead: true }} initialReview={review} />
            : <main className="page page--event"><header><p>{view.age} 岁 · 合成预览</p></header><LifeEventScene life={view} isLoading={stage === "事件生成中"} streamingEvent={{ story: view.story.slice(0, typed), title: typed >= view.story.length ? view.eventTitle : "", choices: [] }} onChoose={id => setMessage(`已选择 ${id}，预览不推进真实人生`)} onContinue={() => changeStage(stage === "出生与早年" ? "童年节点" : "成年选择")} onExit={() => changeStage("出生与早年")} /></main>}
    </section>
  </>;
}
