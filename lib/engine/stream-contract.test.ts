import { expect, it } from "vitest";
import { readStreamedEvent } from "./stream-contract";

it("reads only direct contract fields and top-level choices", () => {
  const result = readStreamedEvent(JSON.stringify({ narrative: { story: "wrong", title: "wrong", outcome: "death", timePassed: 99, people: [{ id: "person", text: "wrong" }] }, choices: [{ text: "选择", id: "A" }], event: { title: "正确" }, story: "决策", narration: "讲述", outcome: "continue", timePassed: 0 }));
  expect(result).toEqual({ story: "决策", narration: "讲述", title: "正确", choices: [{ id: "A", text: "选择" }], outcome: "continue", timePassed: 0 });
});

it("progressively decodes both texts without leaking incomplete escapes", () => {
  const wire = '{"narration":"你好\\n\\"朋友\\"\\\\\\u4f60", "story":"下一幕", "event":{"title":"标题"},"choices":[{"id":"A","text":"做决定"}]}';
  const expected = JSON.parse(wire);
  for (let i = 0; i <= wire.length; i++) {
    const value = readStreamedEvent(wire.slice(0, i));
    expect(expected.narration.startsWith(value.narration ?? "")).toBe(true);
    expect(expected.story.startsWith(value.story)).toBe(true);
  }
  expect(readStreamedEvent(wire)).toMatchObject({ narration: expected.narration, story: expected.story, choices: expected.choices });
});
