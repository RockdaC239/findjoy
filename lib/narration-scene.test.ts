import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import { NarrationScene } from "../components/NarrationScene";
import { ReviewExperience } from "../components/ReviewExperience";
import { buildLifeView } from "./life-view";
import { createStarterLife, applyNextEvent } from "./life";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: () => {} }) }));

it("shows the saved consequences as paragraphs with a single local next-scene action", () => {
  const html = renderToStaticMarkup(createElement(NarrationScene, {
    story: "眼前的回应。\n\n日子渐渐变了。", ready: true, onContinue: () => {},
  }));
  expect(html).toContain("眼前的回应。");
  expect(html).toContain("日子渐渐变了。");
  expect(html).toContain("进入下一幕");
  expect(html).not.toContain("显示全文");
  expect(html).not.toContain("人生决策");
  expect(html).not.toContain("disabled");
});

it("presents the narration without an age heading", () => {
  const html = renderToStaticMarkup(createElement(NarrationScene, {
    story: "开篇正文。", ready: true, onContinue: () => {},
  }));
  expect(html).toContain('aria-label="讲述"');
  expect(html).not.toContain("<h1");
  expect(html).not.toContain("岁");
});

it("does not let a partial uncommitted narration advance to another scene", () => {
  const html = renderToStaticMarkup(createElement(NarrationScene, {
    story: "结果仍在展开", ready: false, onContinue: () => {},
  }));
  expect(html).toContain('aria-busy="true"');
  expect(html).toContain("disabled");
  expect(html).toContain("正在生成");
});

it("keeps the optional home link usable while narration is generating", () => {
  const html = renderToStaticMarkup(createElement(NarrationScene, {
    story: "", ready: false, onContinue: () => {}, homeHref: "/",
  }));
  expect(html).toMatch(/<a[^>]*href="\/"[^>]*>返回主页<\/a>/);
});

it("keeps the final narration visible before farewell even when the life has already ended", () => {
  const state = createStarterLife({ age: 80 });
  state.experienceVersion = 3;
  const ended = applyNextEvent(state, {
    outcome: "death", deathCause: "natural", timePassed: 1,
    narration: "最后那年，你终于收到了远方的回信。", story: "",
    event: { type: "family", title: "最后一封回信", importance: 1 }, choices: [], objectiveChanges: {},
  });
  const html = renderToStaticMarkup(createElement(ReviewExperience, {
    lifeId: ended.lifeId, view: buildLifeView(ended), story: "", cause: "自然离世",
  }));
  expect(html).toContain("最后那年，你终于收到了远方的回信。");
  expect(html).toContain("走向告别");
  expect(html).not.toContain("THE LAST CHAPTER");
  expect(html).toContain("返回主页");
});
