"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./NarrationScene.module.css";

export function NarrationScene({ heading, story, ready, onContinue, onExit, continueLabel = "进入下一幕" }: {
  heading?: string; story: string; ready: boolean; onContinue: () => void; onExit?: () => void; continueLabel?: string;
}) {
  const [showAll, setShowAll] = useState(false);
  const title = useRef<HTMLHeadingElement>(null);
  useEffect(() => { title.current?.focus({ preventScroll: true }); }, []);
  const paragraphs = story.split(/\n+/).map(text => text.trim()).filter(Boolean);

  return <section className={styles.scene} aria-labelledby={heading ? "narration-title" : undefined} aria-label={heading ? undefined : "开篇讲述"} aria-busy={!ready}>
    <div className={styles.content}>
      {heading && <h1 id="narration-title" ref={title} tabIndex={-1}>{heading}</h1>}
      <div className={`${styles.story} ${showAll ? styles.expanded : ""}`}>
        {paragraphs.map((paragraph, index) => <p key={index} style={{ animationDelay: `${index * 900}ms` }}>{paragraph}</p>)}
        {!story && <p role="status">故事正在展开…</p>}
      </div>
      <div className={styles.actions}>
        {!showAll && story && <button className="text-button" type="button" onClick={() => setShowAll(true)}>显示全文</button>}
        <button className="primary-button" type="button" disabled={!ready} onClick={onContinue}>{ready ? continueLabel : "正在生成…"}</button>
        {onExit ? <button className="text-button" type="button" onClick={onExit}>返回主页</button> : <Link className="text-button" href="/">返回主页</Link>}
      </div>
    </div>
  </section>;
}
