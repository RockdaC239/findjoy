import { describe, expect, it, vi } from "vitest";
import { createSharePoster, fitPosterLines, selectPosterMoments } from "./share-poster";
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

  it("picks early, middle and late moments without changing their text", () => {
    expect(selectPosterMoments([
      "18 岁，你离开熟悉的地方。",
      "24 岁，你第一次换工作。",
      "36 岁，你决定留下。",
      "58 岁，孩子离家。",
      "80 岁，你在院子里种树。",
    ])).toEqual([
      { age: "18 岁", text: "你离开熟悉的地方" },
      { age: "36 岁", text: "你决定留下" },
      { age: "80 岁", text: "你在院子里种树" },
    ]);
    expect(selectPosterMoments(["没有年龄的节点"])).toEqual([{ age: "往后", text: "没有年龄的节点" }]);
    expect(selectPosterMoments(["往后，慢慢学会按自己的判断生活。"])).toEqual([{ age: "往后", text: "慢慢学会按自己的判断生活" }]);
    expect(selectPosterMoments(undefined)).toEqual([]);
  });

  it("renders the selected public line and at most three life moments, never the full review", async () => {
    const painted: string[] = [];
    const context = { scale() {}, fillRect() {}, beginPath() {}, roundRect() {}, fill() {}, drawImage() {}, stroke() {}, setLineDash() {}, moveTo() {}, lineTo() {}, arc() {}, measureText: (text: string) => ({ width: text.length * 9 }), fillText: (text: string) => painted.push(text) };
    vi.stubGlobal("Image", class { decode() { return Promise.resolve(); } });
    vi.stubGlobal("document", { fonts: { ready: Promise.resolve() }, createElement: () => ({ getContext: () => context, toBlob: (callback: (blob: Blob) => void) => callback(new Blob()) }) });
    const review = {
      modeLabel: "普通模式",
      age: 81,
      observation: "私密长文",
      moments: ["27 岁，放弃了第一次创业机会。", "34 岁，第一次选择家庭，而不是晋升。", "往后，慢慢学会，按自己的判断生活。"],
      question: "私密问题",
      shareLines: ["给自己留一点时间。", "生活还有别的可能。"],
    } as Review;
    try {
      await createSharePoster(review, review.shareLines![1]);
      expect(painted).toContain("生活还有别的可能。");
      expect(painted).toContain("普通模式 · 享年 81 岁");
      expect(painted).toEqual(expect.arrayContaining(["27 岁", "放弃了第一次创业机会", "34 岁", "第一次选择家庭，而不是晋升", "往后", "慢慢学会，按自己的判断生活"]));
      expect(painted.join("")).not.toMatch(/私密|undefined/);
      painted.length = 0;
      await createSharePoster(review, "不属于候选的私密文字");
      expect(painted).toContain("人生没有答案，只有选择。");
      expect(painted.join("")).not.toMatch(/私密长文|私密问题|不属于候选的私密文字/);
      painted.length = 0;
      await createSharePoster({ ...review, shareLines: undefined });
      expect(painted).toContain("人生没有答案，只有选择。");
      expect(painted.join("")).not.toContain("私密长文");
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
