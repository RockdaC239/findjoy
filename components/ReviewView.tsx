"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AccountNav } from "./AccountNav";
import { useRouter } from "next/navigation";
import { BrandLogo } from "./BrandLogo";
import type { LifeView } from "../lib/life-view";
import { parseReview, type Review } from "../lib/review";
import { API_BASE } from "../lib/life-session";

export function ReviewView({ lifeId, view, onStatus, initialReview }: { lifeId: string; view: LifeView; onStatus?: (status: { ready: boolean; error: string }) => void; initialReview?: Review }) {
  const router = useRouter();
  const [review, setReview] = useState<Review | null>(initialReview ?? null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (initialReview) { onStatus?.({ ready: true, error: "" }); return; }
    let cancelled = false;
    async function load() {
      try {
        const configResponse = await fetch(`${API_BASE}/api/model-config`, { signal: AbortSignal.timeout(5000) }).catch(() => null);
        const configPayload = configResponse?.ok
          ? (await configResponse.json()) as { mode?: string; config?: { providerId?: string; model?: string } }
          : null;
        const modelConfig = configPayload?.mode === "environment"
          ? undefined
          : configPayload?.config?.providerId && configPayload.config.model
            ? { providerId: configPayload.config.providerId, model: configPayload.config.model }
            : undefined;
        const response = await fetch(`${API_BASE}/api/life/${encodeURIComponent(lifeId)}/ending`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ modelConfig }),
          signal: AbortSignal.timeout(90_000),
        });
        if (response.status === 401) {
          router.replace(`/login?returnTo=${encodeURIComponent(`/findjoy/review/${lifeId}`)}`);
          return;
        }
        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || "这一生的回顾暂时没有生成，请稍后重试。");
        }
        const payload = (await response.json()) as unknown;
        if (!cancelled) { setReview(parseReview(payload, view)); onStatus?.({ ready: true, error: "" }); }
      } catch (cause) {
        if (!cancelled) {
          const message = cause instanceof Error ? cause.message : "这一生的回顾暂时没有生成，请稍后重试。";
          setError(message); onStatus?.({ ready: false, error: message });
        }
      }
    }
    load();
    return () => { cancelled = true; };
  }, [lifeId, view, attempt, router, onStatus, initialReview]);

  return (
    <main className="page page--review">
      <header className="topbar" aria-label="Primary navigation">
        <BrandLogo href="/" />
        <nav className="topbar-actions" aria-label="页面导航">
          <Link className="settings-button" href="/">回到开始页</Link>
          <AccountNav />
        </nav>
      </header>

      {review ? (
        <section className="review" aria-labelledby="review-title">
          <p className="eyebrow">A LIFE REMEMBERED</p>
          <p className="review-mode">{review.modeLabel} · {review.modeDetail}</p>
          <h1 id="review-title">你的<br />一生。</h1>
          <p className="lived">享年 <strong>{review.age}</strong> 岁<span className="death-cause">，{review.death}</span></p>
          <div className="review-section facts"><p className="section-label">这一生</p>{review.facts.map((fact) => <p key={fact}>{fact}</p>)}</div>
          <div className="review-section"><p className="section-label">改变方向的时刻</p>{review.moments.map((moment) => <p className="moment" key={moment}>{moment}</p>)}</div>
          <div className="reflection"><p className="section-label">回望</p><p>{review.observation}</p></div>
          <div className="final-question"><p>{review.question}</p><div><Link className="text-button" href="/">我愿意。</Link><Link className="primary-button" href="/">我想再活一次 <span aria-hidden="true">↗</span></Link></div></div>
        </section>
      ) : (
        <section className="review" aria-live="polite">
          <p className="eyebrow">A LIFE REMEMBERED</p>
          <h1>你的<br />一生。</h1>
          {error ? (
            <>
              <p className="lived">{error}</p>
              <button className="primary-button" type="button" onClick={() => { setReview(null); setError(""); setAttempt((value) => value + 1); }}>重新生成回顾</button>
            </>
          ) : (
            <p className="lived">正在整理这一生…</p>
          )}
        </section>
      )}
    </main>
  );
}
