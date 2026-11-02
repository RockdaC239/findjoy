import { describe, expect, it } from "vitest";
import type { LifeView } from "./life-view";
import { parseReview } from "./review";

const view: LifeView = {
  lifeId: "life-1",
  age: 82,
  city: "上海",
  occupation: "编辑",
  family: "已婚",
  finance: "租住",
  health: "普通",
  eventTitle: "一次新的邀请",
  story: "",
  choices: [],
  scenario: { mode: "normal" },
  dead: true,
};

describe("life review", () => {
  it("maps a generated ending onto the review shape", () => {
    const review = parseReview({ ending: {
      age: 82,
      death: "在很深的年纪平静离世",
      facts: { occupation: "编辑", city: "上海", events: 4 },
      highlights: [{ age: 36, title: "一次新的邀请" }],
      patterns: ["你愿意在重要的时刻停下来。"],
      question: "如果这是你真实的一生，你愿意这样活吗？",
    } }, view);
    expect(review).toMatchObject({
      age: 82,
      death: "在很深的年纪平静离世",
      facts: ["编辑", "在上海生活过", "经历 4 个重要人生事件"],
      moments: ["36 岁，一次新的邀请。"],
      observation: "你愿意在重要的时刻停下来。",
      modeLabel: "普通模式",
    });
  });

  it("keeps the page usable when the ending is unavailable", () => {
    const review = parseReview({}, view);
    expect(review.age).toBe(82);
    expect(review.facts).toContain("在上海生活过");
    expect(review.question).toContain("愿意");
    expect(review.modeLabel).toBe("普通模式");
  });
});
