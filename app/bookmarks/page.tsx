import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "../../components/BrandLogo";
import { AccountNav } from "../../components/AccountNav";
import { BookmarkCover } from "../../components/BookmarkCover";
import { bookmarks, getBookmarkSource } from "../../lib/bookmarks";

export const metadata: Metadata = {
  title: "觅乐书签 | FindJoy",
  description: "分享关于幸福、人生意义与如何生活的好内容。",
};

export default function BookmarksPage() {
  return (
    <div className="page bookmarks-page">
      <header className="topbar" aria-label="书签导航">
        <BrandLogo href="/" />
        <nav className="topbar-actions" aria-label="页面导航"><Link className="settings-button" href="/">返回首页</Link><AccountNav showRecharge={false} /></nav>
      </header>
      <main className="bookmarks-content">
        <div className="bookmarks-heading">
          <h1>觅乐书签</h1>
          <p>{metadata.description}</p>
          <p className="bookmarks-hint">点击卡片，在新标签页打开原文或内容页面。</p>
        </div>
        {bookmarks.length === 0 ? (
          <p className="bookmarks-empty">书签正在整理中，稍后再来看看。</p>
        ) : (
          <ul className="bookmarks-grid">
            {bookmarks.map((bookmark) => (
              <li key={bookmark.id}>
                <a className="bookmark-card" href={bookmark.url} target="_blank" rel="noopener noreferrer">
                  <BookmarkCover cover={bookmark.cover} />
                  <div className="bookmark-copy">
                    <h2>{bookmark.title}</h2>
                    {bookmark.description?.trim() && <p className="bookmark-description">{bookmark.description.trim()}</p>}
                    <div className="bookmark-meta">
                      <span>{bookmark.author?.trim() && <>{bookmark.author.trim()} · </>}{getBookmarkSource(bookmark)}</span>
                      <span aria-hidden="true">↗</span>
                    </div>
                    <span className="bookmarks-sr-only">（在新标签页打开）</span>
                  </div>
                </a>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
