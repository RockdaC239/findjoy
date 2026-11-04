"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import type { Review } from "../lib/review";
import { createSharePoster } from "../lib/share-poster";
import { normalizeShareLines } from "../lib/share-copy";

export function ReviewShare({ review }: { review: Review }) {
  const choiceId = useId();
  const candidates = normalizeShareLines(review.shareLines);
  const [selectedLine, setSelectedLine] = useState(candidates[0] ?? "");
  const dialog = useRef<HTMLDialogElement>(null);
  const image = useRef("");
  const generation = useRef(0);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => () => {
    generation.current++;
    if (image.current) URL.revokeObjectURL(image.current);
  }, []);

  async function generate(line = selectedLine) {
    const request = ++generation.current;
    setLoading(true);
    if (image.current) URL.revokeObjectURL(image.current);
    image.current = "";
    setImageUrl("");
    setError("");
    try {
      const blob = await createSharePoster(review, line);
      if (request !== generation.current) return;
      const url = URL.createObjectURL(blob);
      image.current = url;
      setImageUrl(url);
    } catch {
      if (request === generation.current) setError("海报暂时没有生成，请重试。");
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }

  return <>
    <div className="review-share-invite">
      <span>把这一生，讲给朋友</span>
      <svg className="review-share-arrow" viewBox="0 0 48 32" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 7c10 19 25 20 40 9m-10-1 11 0-3 10" /></svg>
      <button className="review-share-trigger" type="button" aria-label="分享这一生" aria-haspopup="dialog" onClick={() => {
        dialog.current?.showModal();
        if (!imageUrl && !loading) void generate();
      }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="m8.6 10.5 6.8-4M8.6 13.5l6.8 4" /></svg>
      </button>
    </div>
    <dialog ref={dialog} className="review-share-dialog" aria-label="分享这一生">
      <div className="review-share-art" aria-busy={loading}>
        {imageUrl ? <Image unoptimized className="review-share-preview" src={imageUrl} width={1080} height={1620} alt="这一生的分享海报" /> : <div className="review-share-loading" role="status">
          {error ? <><p>{error}</p><button type="button" onClick={() => void generate()}>重新生成</button></> : <p>正在整理这一生…</p>}
        </div>}
        <button className="review-share-close" type="button" aria-label="关闭分享弹窗" autoFocus onClick={() => dialog.current?.close()}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M6 18 18 6" /></svg>
        </button>
      </div>
      <div className="review-share-actions">
        {candidates.length > 0 && <div style={{ margin: "0 auto 16px", maxWidth: "100%" }}>
          <label htmlFor={choiceId} style={{ display: "block", marginBottom: 8 }}>选择一句想分享的话</label>
          <select id={choiceId} className="review-share-save" style={{ width: "100%", maxWidth: "100%", minWidth: 0, borderRadius: 12, fontSize: 14, background: "var(--fj-color-surface)", color: "var(--fj-color-text)" }} value={selectedLine} onChange={event => {
            const line = event.target.value;
            setSelectedLine(line);
            void generate(line);
          }}>
            {candidates.map((line, index) => <option key={`${index}:${line}`} value={line}>{line}</option>)}
          </select>
        </div>}
        <p style={{ textAlign: "center", fontSize: 12 }}>海报只展示所选短句与品牌文字，不包含人生节点。</p>
        {imageUrl ? <a className="review-share-save" href={imageUrl} download="FindJoy-我的另一种人生.png">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m-5-5 5 5 5-5M5 16v5h14v-5" /></svg>
          保存图片
        </a> : <button className="review-share-save" type="button" disabled>保存图片</button>}
      </div>
    </dialog>
  </>;
}
