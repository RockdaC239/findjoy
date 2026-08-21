import { describe, expect, it } from "vitest";
import { readStreamedEvent } from "./stream-event";

describe("readStreamedEvent", () => {
  it("extracts choices regardless of field order or extra whitespace", () => {
    // 模型偶尔把 text 写在 id 前面，或带空格：旧实现会漏掉这些选项，导致卡片内容闪跳。
    const input = '{"choices":[{"text":"去外地闯一闯","id":"A"},{ "id" : "B" , "text" : "留在本地" }]}';
    expect(readStreamedEvent(input).choices).toEqual([
      { id: "A", text: "去外地闯一闯" },
      { id: "B", text: "留在本地" },
    ]);
  });

  it("reveals the story and each completed choice without waiting for the full JSON object", () => {
    const partial = '{"story":"你看见午后的光。","event":{"title":"窗边"},"choices":[{"id":"A","text":"靠近窗边"},{"id":"B","text":"留在原地"},';

    expect(readStreamedEvent(partial)).toEqual({
      story: "你看见午后的光。",
      title: "窗边",
      choices: [
        { id: "A", text: "靠近窗边" },
        { id: "B", text: "留在原地" },
      ],
    });
  });
});
