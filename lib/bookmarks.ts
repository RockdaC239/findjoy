export type Bookmark = {
  id: string;
  title: string;
  url: string;
  cover?: string;
  description?: string;
  author?: string;
  source?: string;
};

// 新分享放在数组开头；封面路径相对于 public，不包含部署前缀。
export const bookmarks: Bookmark[] = [
  {
    id: "li-mu-sgd-life",
    title: "用随机梯度下降来优化人生",
    url: "https://zhuanlan.zhihu.com/p/414009313",
    description: "借用随机梯度下降的思路，聊聊人生中的目标、探索与步子的大小：不必等想清楚所有事情，再迈出下一步。",
    author: "李沐",
    source: "知乎",
  },
];

export function getBookmarkSource(bookmark: Pick<Bookmark, "url" | "source">): string {
  return bookmark.source?.trim() || new URL(bookmark.url).hostname;
}
