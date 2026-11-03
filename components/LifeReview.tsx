import Link from "next/link";
import type { ReactNode } from "react";
import type { Review } from "../lib/review";
import styles from "./ReviewView.module.css";

export function LifeReview({ review, children }: { review: Review; children?: ReactNode }) {
  return <section className={styles.review} aria-labelledby="review-title">
    <header className={styles.heading}>
      <p className={styles.eyebrow}>A LIFE REMEMBERED</p>
      <h1 id="review-title">你的一生</h1>
      <p className={styles.mode}>{review.modeLabel} · {review.modeDetail}</p>
      <p className={styles.lived}>享年 <strong>{review.age}</strong> 岁，{review.death}</p>
    </header>
    <ul className={styles.facts} aria-label="这一生的概要">{review.facts.map((fact, index) => <li key={index}>{fact}</li>)}</ul>
    <section className={styles.moments} aria-labelledby="review-moments-title">
      <h2 id="review-moments-title">改变方向的时刻</h2>
      <ol>{review.moments.map((moment, index) => <li key={index}>{moment}</li>)}</ol>
    </section>
    <section className={styles.reflection} aria-labelledby="review-reflection-title"><h2 id="review-reflection-title">回望</h2><p>{review.observation}</p></section>
    {children && <div className={styles.share}>{children}</div>}
    <section className={styles.question} aria-label="你对这一生的回答"><p>{review.question}</p><div className={styles.actions}><Link className={`primary-button ${styles.action}`} href="/">我愿意 <span aria-hidden="true">↗</span></Link><Link className={`primary-button ${styles.action}`} href="/">我想再活一次 <span aria-hidden="true">↗</span></Link></div></section>
  </section>;
}
