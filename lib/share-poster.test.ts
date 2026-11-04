import { describe, expect, it, vi } from "vitest";
import { createSharePoster, fitPosterLines } from "./share-poster";
import type { Review } from "./review";

const measure = (text: string) => [...new Intl.Segmenter("zh", { granularity: "grapheme" }).segment(text)].length;

describe("share poster text", () => {
  it("wraps Chinese into the available width without losing short text", () => {
    expect(fitPosterLines("你选择留下陪伴家人", 5, 3, measure)).toEqual(["你选择留下", "陪伴家人"]);
  });

  it("marks overflowing text with an ellipsis inside the final line", () => {
    const lines = fitPosterLines("这一生你有过很多次离开的机会但选择留下", 6, 2, measure);
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith("…")).toBe(true);
    expect(lines.every((line) => measure(line) <= 6)).toBe(true);
  });

  it("preserves emoji clusters and normalizes line breaks", () => {
    expect(fitPosterLines("👨‍👩‍👧‍👦陪伴\n家人", 3, 3, measure)).toEqual(["👨‍👩‍👧‍👦陪伴", " 家人"]);
    expect(fitPosterLines("  ", 6, 2, measure)).toEqual([]);
  });

  it("renders only a selected public line, never private review text or moments", async () => {
    const painted: string[] = [];
    const context = { scale() {}, fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, drawImage() {}, stroke() {}, setLineDash() {}, moveTo() {}, lineTo() {}, arc() {}, measureText: (text: string) => ({ width: text.length * 15 }), fillText: (text: string) => painted.push(text) };
    vi.stubGlobal("Image", class { decode() { return Promise.resolve(); } });
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() }, createElement: () => ({ getContext: () => context, toBlob: (callback: (blob: Blob) => void) => callback(new Blob()) }) });
    const review = { observation: "私密长文", moments: ["私密病史"], question: "私密问题", shareLines: ["给自己留一点时间。", "生活还有别的可能。"] } as Review;
    try {
      await createSharePoster(review, review.shareLines![1]);
      expect(painted).toContain("生活还有别的可能。");
      expect(painted.join("")).not.toMatch(/私密|undefined/);
      painted.length = 0;
      await createSharePoster(review, "不属于候选的私密文字");
      expect(painted).toContain("人生没有答案，只有选择。");
      expect(painted.join("")).not.toMatch(/私密|生活还有别的可能/);
      painted.length = 0;
      await createSharePoster({ ...review, shareLines: undefined });
      expect(painted).toContain("人生没有答案，只有选择。");
      expect(painted.join("")).not.toContain("私密");
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("fails with a retryable error when image resources never finish loading", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("Image", class { decode() { return new Promise(() => {}); } });
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() } });
    try {
      let error: unknown;
      const pending = createSharePoster({} as Review).catch((cause) => { error = cause; });
      await vi.advanceTimersByTimeAsync(15_000);
      expect(error).toBeInstanceOf(Error);
      await pending;
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  });
});
