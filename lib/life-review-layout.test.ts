import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { LifeReview } from "../components/LifeReview";
import type { Review } from "./review";
it("keeps every fact, moment, reflection and both equal answers in the vertical review", () => {
  const review: Review = { age: 81, death: "自然离世", modeLabel: "普通模式", modeDetail: "从出生开始", facts: ["教师", "成都", "24个人生节点"], moments: Array.from({ length: 8 }, (_, index) => `${index + 20}岁，一个重要决定`), observation: "你似乎一直在寻找自己的生活节奏。", question: "如果这是你真实的一生，你愿意这样活吗？" };
  const html = renderToStaticMarkup(createElement(LifeReview, { review }));
  for (const text of [...review.facts, ...review.moments, review.observation, review.question]) expect(html).toContain(text);
  expect(html).toContain('id="review-title">你的一生</h1>');
  expect(html).toMatch(/id="review-facts-title"[^>]*>这一生<\/h2>/);
  expect(html.match(/class="primary-button /g)).toHaveLength(2);
  expect(html).not.toContain("<br");
  expect(html.indexOf("改变方向的时刻")).toBeLessThan(html.indexOf("review-reflection-title"));
  expect(html.indexOf("review-reflection-title")).toBeLessThan(html.indexOf("你对这一生的回答"));
});
