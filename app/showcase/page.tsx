import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "../../components/BrandLogo";
import styles from "./showcase.module.css";

export const metadata: Metadata = {
  title: "findjoy · AI 人生模拟器",
  description: "一款由 AI 驱动的人生模拟游戏。不评价成功，不算幸福分数——你得到的不是评分，而是一面关于自己的镜子。",
};

const pillars = [
  { no: "01", title: "出生", desc: "身份、家庭与命运就此展开。没有剧本，只有漫长而未知的日子。" },
  { no: "02", title: "选择", desc: "每一次决定都站在真实的价值冲突上：财富与时间、稳定与冒险、自己与他人期待。" },
  { no: "03", title: "回望", desc: "走到终点后，AI 不评价、不打分，只陪你看清：选择背后的你，究竟是怎样的人。" },
] as const;

export default function ShowcasePage() {
  return (
    <main className={styles.page}>
      <div className={styles.frame} aria-hidden="true" />
      <div className={styles.inner}>
        <header className={styles.topbar}>
          <BrandLogo href="/" />
          <div className={styles.topActions}>
            <span className={styles.topNote}>AI 人生模拟器</span>
            <Link href="/" className={styles.cta}>开始体验 <span aria-hidden="true">↗</span></Link>
          </div>
        </header>

        <div className={styles.hero}>
          <section className={styles.copy} aria-labelledby="showcase-title">
            <p className={styles.eyebrow}>FIND YOUR WAY TO JOY</p>
            <h1 id="showcase-title" className={styles.h1}>人生没有答案，<br />只有选择<span className={styles.period}>。</span></h1>
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
              “人生不是一个刷属性直到成功的游戏，<br />而是一个你究竟想怎么活的游戏。”
            </blockquote>
          </section>

          <aside className={styles.qrSide} aria-label="扫码开始">
            <div className={styles.qrCard}>
              <p className={styles.qrLabel}>扫码 · 开始你的一生</p>
              <div className={styles.qrWrap}>
                <span className={styles.pulse} aria-hidden="true" />
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
    </main>
  );
}
