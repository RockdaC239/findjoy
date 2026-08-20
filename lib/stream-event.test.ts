import { describe, expect, it } from "vitest";
import { readStreamedEvent } from "./stream-event";

describe("readStreamedEvent", () => {
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
