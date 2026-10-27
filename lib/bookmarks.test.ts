import { describe, expect, it } from "vitest";
import { bookmarks, getBookmarkSource } from "./bookmarks";

describe("书签内容", () => {
  it("每条内容都有唯一标识、非空标题和安全的完整外链", () => {
    expect(new Set(bookmarks.map((bookmark) => bookmark.id)).size).toBe(bookmarks.length);
    for (const bookmark of bookmarks) {
      expect(bookmark.id.trim()).not.toBe("");
      expect(bookmark.title.trim()).not.toBe("");
      expect(["http:", "https:"]).toContain(new URL(bookmark.url).protocol);
    }
  });

  it("未填写来源时使用域名，填写来源时去掉首尾空白", () => {
    expect(getBookmarkSource({ url: "https://example.com/article", source: "  " })).toBe("example.com");
    expect(getBookmarkSource({ url: "https://example.com/article", source: " 知乎 " })).toBe("知乎");
  });
});
