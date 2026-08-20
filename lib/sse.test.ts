import { describe, expect, it } from "vitest";
import { parseSseMessages } from "./sse";

describe("parseSseMessages", () => {
  it("returns complete SSE messages split across response chunks", () => {
    const first = parseSseMessages('event: status\ndata: {"message":"正在生成"}\n\n' + 'event: token\ndata: {"text":"你"}');
    const second = parseSseMessages(first.remainder + '\n\n');

    expect(first.messages).toEqual([{ event: "status", data: '{"message":"正在生成"}' }]);
    expect(second.messages).toEqual([{ event: "token", data: '{"text":"你"}' }]);
    expect(second.remainder).toBe("");
  });
});
