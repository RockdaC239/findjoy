"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import Link from "next/link";
import { ShowcaseLogo } from "./ShowcaseLogo";
import styles from "./showcase.module.css";

// PPT 只做「提取重点 + 提词」，细节由演讲人口述：
// - 第 1 页为浓缩要点页（不含原文，去掉第一人称）
// - 其余叙事页保留原文逐字，或按用户要求精简/合并/删除
// - 结尾页（第 9 页）保留原展示海报：人生没有答案，只有选择 + 二维码
type NarrativeSlide = {
  no: string;
  img: string;
  /** 单段原文（逐字） */
  text?: string;
  /** 多行原文（逐字，同一页，如原 4、5 段合并） */
  lines?: string[];
  /** 浓缩页：主句 */
  title?: string;
  /** 浓缩页：要点列表（提词用） */
  points?: string[];
};

const narrativeSlides: NarrativeSlide[] = [
  {
    no: "01",
    title: "一个 idea",
    points: [
      "一款人生模拟器",
      "玩遍各种各样的人生",
      "在体验里，找到自己真正向往的生活",
      "于是有了 demo：findjoy · 觅乐",
    ],
    img: "deck-01-idea.jpg",
  },
  {
    no: "02",
    text: "没有目标，没有数值，没有评判",
    img: "deck-02-thickness.jpg",
  },
  {
    no: "03",
    text: "这款产品的核心就是一次又一次的决策，整个人生故事线由ai驱动。",
    img: "deck-03-decisions.jpg",
  },
  {
    no: "04",
    lines: [
      "根据用户的过往经历，以及当下所做的决定，来实时推演下一个节点发生的事。",
      "从而推动用户再次做出决策。",
    ],
    img: "deck-04-nodes.jpg",
  },
  {
    no: "05",
    text: "每一个决策都会把用户推向不同的人生方向，用户要在爱情、事业、亲情、友情之间做平衡、做抉择。",
    img: "deck-05-directions.jpg",
  },
  {
    no: "06",
    text: "所有选择都没有对错，也没有所谓的成功，只想帮助用户在走过多种人生后，找到自己想过的生活，找到幸福。",
    img: "deck-06-path.jpg",
  },
  {
    no: "07",
    text: "幸福是什么？",
    img: "deck-07-happiness.jpg",
  },
  {
    no: "08",
    text: "这便是findjoy的意义所在。",
    img: "deck-10-meaning.jpg",
  },
];

const pillars = [
  { no: "01", title: "出生", desc: "身份、家庭与命运就此展开。没有剧本，只有漫长而未知的日子。" },
  { no: "02", title: "选择", desc: "每一次决定都站在真实的价值冲突上：财富与时间、稳定与冒险、自己与他人期待。" },
  { no: "03", title: "回望", desc: "走到终点后，AI 不评价、不打分，只陪你看清：选择背后的你，究竟是怎样的人。" },
] as const;

const ASSET_PREFIX = "/findjoy"; // 与 next.config basePath 一致

// 按段落长度分级字号：短句用超大衬线，长段降级保证一屏放得下
function textSizeClass(len: number): string {
  if (len <= 24) return styles.t1;
  if (len <= 40) return styles.t2;
  if (len <= 70) return styles.t3;
  return styles.t4;
}

export default function ShowcaseDeck() {
  const total = narrativeSlides.length + 1;
  const [index, setIndex] = useState(0);
  const indexRef = useRef(0);
  const wheelLockAt = useRef(0);
  const [reduceMotion, setReduceMotion] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  });

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  // 会场大屏：优先适配 prefers-reduced-motion
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = (e: MediaQueryListEvent) => setReduceMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 预加载全部叙事配图，翻页不卡顿
  useEffect(() => {
    narrativeSlides.forEach((s) => {
      const im = new Image();
      im.src = ASSET_PREFIX + "/deck/" + s.img;
    });
  }, []);

  const go = useCallback(
    (target: number) => {
      setIndex(Math.max(0, Math.min(total - 1, target)));
    },
    [total]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["ArrowRight", "ArrowDown", "PageDown", " "].includes(e.key)) {
        e.preventDefault();
        go(indexRef.current + 1);
      } else if (["ArrowLeft", "ArrowUp", "PageUp"].includes(e.key)) {
        e.preventDefault();
        go(indexRef.current - 1);
      } else if (e.key === "Home") {
        go(0);
      } else if (e.key === "End") {
        go(total - 1);
      }
    };
    // 结尾页内容超出视口（小屏）时允许原生滚动，翻页手势让位
    const endingOverflows = () => {
      if (indexRef.current !== total - 1) return false;
      const el = document.querySelector("[data-ending]");
      return !!el && el.scrollHeight > el.clientHeight + 1;
    };
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement).closest("a, button")) return;
      if (endingOverflows()) return;
      const half = window.innerWidth / 2;
      go(indexRef.current + (e.clientX > half ? 1 : -1));
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 24) return;
      if (endingOverflows()) return; // 交给原生滚动
      const now = Date.now();
      if (now - wheelLockAt.current < 700) return;
      wheelLockAt.current = now;
      e.preventDefault();
      go(indexRef.current + (e.deltaY > 0 ? 1 : -1));
    };
    let touchStartX: number | null = null;
    const onTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    };
    const onTouchEnd = (e: TouchEvent) => {
      if (touchStartX === null) return;
      const dx = e.changedTouches[0].clientX - touchStartX;
      if (Math.abs(dx) > 40) go(indexRef.current + (dx < 0 ? 1 : -1));
      touchStartX = null;
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    window.addEventListener("wheel", onWheel, { passive: false });
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchend", onTouchEnd);
    };
  }, [go, total]);

  const isEnding = index === total - 1;
  const deckClass = [styles.deck, reduceMotion ? styles.reduceMotion : null, isEnding ? styles.onEnding : null]
    .filter(Boolean)
    .join(" ");

  const slideBody = (s: NarrativeSlide): ReactNode => {
    if (s.title) {
      return (
        <>
          <p data-deck-title className={[styles.deckText, styles.t1].join(" ")}>{s.title}</p>
          <div className={styles.deckPoints}>
            {(s.points ?? []).map((pt, j) => (
              <p key={j} data-deck-point className={styles.deckPoint}>
                <span className={styles.deckPointMark} aria-hidden="true">·</span>
                {pt}
              </p>
            ))}
          </div>
        </>
      );
    }
    if (s.lines) {
      const size = textSizeClass(s.lines.join("").length);
      return (
        <div className={styles.deckLines}>
          {s.lines.map((ln, j) => (
            <p key={j} data-deck-line className={[styles.deckText, size].join(" ")}>
              {ln}
            </p>
          ))}
        </div>
      );
    }
    return <p className={[styles.deckText, textSizeClass((s.text ?? "").length)].join(" ")}>{s.text}</p>;
  };

  return (
    <div className={deckClass}>
      {narrativeSlides.map((s, i) => (
        <section
          key={s.no}
          className={[styles.slide, styles.slideDark, i === index ? styles.slideActive : null]
            .filter(Boolean)
            .join(" ")}
          role="region"
          aria-label={s.title ?? s.text ?? (s.lines ?? []).join("")}
          aria-hidden={i !== index}
        >
          <div className={styles.bg}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 全屏装饰背景图，需原图直出保证质感 */}
            <img
              className={styles.bgImg}
              src={ASSET_PREFIX + "/deck/" + s.img}
              alt=""
              draggable={false}
              onError={(e) => e.currentTarget.classList.add(styles.bgImgHidden)}
            />
            <div className={styles.veil} />
          </div>
          <div className={styles.content}>{slideBody(s)}</div>
        </section>
      ))}

      {/* 结尾页：保留原展示海报（人生没有答案，只有选择 + 二维码） */}
      <section
        data-ending
        className={[styles.slide, styles.ending, index === total - 1 ? styles.slideActive : null]
          .filter(Boolean)
          .join(" ")}
        role="region"
        aria-label="人生没有答案，只有选择"
        aria-hidden={!isEnding}
      >
        <div className={[styles.inner, styles.innerInSlide].join(" ")}>
          <header className={styles.topbar}>
            <ShowcaseLogo />
            <div className={styles.topActions}>
              <span className={styles.topNote}>AI 人生模拟器</span>
              <Link href="/" className={styles.cta}>
                开始体验 <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </header>

          <div className={styles.hero}>
            <section className={styles.copy} aria-labelledby="showcase-title">
              <p className={styles.eyebrow}>FIND YOUR WAY TO JOY</p>
              <h1 id="showcase-title" className={styles.h1}>
                人生没有答案，
                <br />
                只有选择<span className={styles.period}>。</span>
              </h1>
              <p className={styles.lead}>
                一款由 AI 驱动的人生模拟游戏。从出生到死亡，你在事业、爱情、家庭、健康之间不断做出选择，
                AI 记住你的每一次决定，让时间真实地向前。不评价成功，不算幸福分数——
                你得到的不是评分，而是一面关于自己的镜子。
              </p>
              <div className={styles.pillars}>
                {pillars.map((p) => (
                  <div className={styles.pillar} key={p.no}>
                    <span className={styles.pillarNo}>{p.no}</span>
                    <h2 className={styles.pillarTitle}>{p.title}</h2>
                    <p className={styles.pillarDesc}>{p.desc}</p>
                  </div>
                ))}
              </div>
              <blockquote className={styles.quote}>
                “人生不是一个刷属性直到成功的游戏，
                <br />
                而是一个你究竟想怎么活的游戏。”
              </blockquote>
            </section>

            <aside className={styles.qrSide} aria-label="扫码开始">
              <div className={styles.qrCard}>
                <p className={styles.qrLabel}>扫码 · 开始你的一生</p>
                <div className={styles.qrWrap}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- 二维码必须原图直出，避免任何图片优化/重编码影响扫码精度 */}
                  <img
                    className={styles.qrImg}
                    src="/findjoy/findjoy-qr.png"
                    alt="findjoy 人生模拟器二维码：手机扫码即可开始体验"
                    width={1024}
                    height={1024}
                  />
                </div>
                <p className={styles.qrUrl}>http://124.221.235.9/findjoy</p>
              </div>
              <p className={styles.qrHint}>手机扫码 · 一局约 20 分钟</p>
            </aside>
          </div>

          <footer className={styles.footer}>
            <span>故事优先于数值</span>
            <span className={styles.footerDot} aria-hidden="true">·</span>
            <span>不设幸福分数</span>
            <span className={styles.footerDot} aria-hidden="true">·</span>
            <span>系统负责描述人生，玩家负责评价人生</span>
          </footer>
        </div>
      </section>

      <div className={styles.hud} aria-live="polite">
        <span className={styles.counter}>
          <span className={styles.counterCur}>{String(index + 1).padStart(2, "0")}</span>
          <span className={styles.counterTotal}> / {String(total).padStart(2, "0")}</span>
        </span>
        <div
          className={styles.progress}
          role="progressbar"
          aria-valuemin={1}
          aria-valuemax={total}
          aria-valuenow={index + 1}
        >
          <div className={styles.progressFill} style={{ width: ((index + 1) / total) * 100 + "%" }} />
        </div>
        <span className={styles.hint}>← → 翻页</span>
      </div>
    </div>
  );
}

