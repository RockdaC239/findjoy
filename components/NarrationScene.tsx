"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import styles from "./NarrationScene.module.css";

export function NarrationScene({ story, ready, onContinue, continueLabel = "进入下一幕", homeHref }: {
  story: string; ready: boolean; onContinue: () => void; continueLabel?: string; homeHref?: string;
}) {
  const scene = useRef<HTMLElement>(null);
  const storyBox = useRef<HTMLDivElement>(null);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => { scene.current?.focus({ preventScroll: true }); }, []);

  // 固定阅读区放不下全文时，用底部渐隐提示还可以继续往下读。
  useEffect(() => {
    const element = storyBox.current;
    if (!element) return;
    const update = () => setScrollable(element.scrollHeight - element.scrollTop > element.clientHeight + 2);
    update();
    element.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => { element.removeEventListener("scroll", update); observer.disconnect(); };
  }, [story]);

  const paragraphs = story.split(/\n+/).map(text => text.trim()).filter(Boolean);

  return <section ref={scene} tabIndex={-1} className={styles.scene} aria-label="讲述" aria-busy={!ready}>
    <div className={styles.content}>
      <div ref={storyBox} className={`${styles.story} ${scrollable ? styles.storyFade : ""}`}>
        <div className={styles.storyFlow}>
          {paragraphs.map((paragraph, index) => <p key={index} style={{ animationDelay: `${index * 900}ms` }}>{paragraph}</p>)}
          {!story && <p role="status">故事正在展开…</p>}
        </div>
      </div>
      <div className={styles.actions}>
        <button className="primary-button" type="button" disabled={!ready} onClick={onContinue}>{ready ? continueLabel : "正在生成…"}</button>
        {homeHref && <Link className="text-button" href={homeHref}>返回主页</Link>}
      </div>
    </div>
  </section>;
}
