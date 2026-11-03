"use client";

import { useEffect, useState } from "react";
import { farewellLines } from "../lib/farewell";
import styles from "./Farewell.module.css";

export function Farewell({ age, story, cause, ready, error, onContinue, onRetry }: {
  age: number; story?: string; cause: string; ready: boolean; error: string;
  onContinue: () => void; onRetry: () => void;
}) {
  const lines = farewellLines(story, cause);
  const [finished, setFinished] = useState(false);
  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timer = window.setTimeout(() => setFinished(true), reduced ? 0 : 1400 + lines.length * 1000);
    return () => window.clearTimeout(timer);
  }, [lines.length]);
  useEffect(() => {
    if (!finished || !ready) return;
    const timer = window.setTimeout(onContinue, 1200);
    return () => window.clearTimeout(timer);
  }, [finished, ready, onContinue]);

  return <main className={styles.farewell} aria-labelledby="farewell-title">
    <div className={styles.content}>
      <p className={styles.eyebrow}>THE LAST CHAPTER</p>
      <h1 id="farewell-title">这一年，你 {age} 岁</h1>
      <div className={styles.story}>{lines.map((line, index) => <p key={index} style={{ animationDelay: `${700 + index * 1000}ms` }}>{line}</p>)}</div>
      <div className={styles.status} role="status" aria-live="polite">
        {error ? <><p>{error}</p><button className="primary-button" onClick={onRetry}>重新生成人生回顾</button></>
          : ready ? <><p>这一生，已经整理好了</p><button className="text-button" onClick={onContinue}>回望这一生 ↗</button></>
            : <><span className={styles.spinner} aria-hidden="true" /><p>正在整理这一生，请稍候…</p></>}
      </div>
    </div>
  </main>;
}
