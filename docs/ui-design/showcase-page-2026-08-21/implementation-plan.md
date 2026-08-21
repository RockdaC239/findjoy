# 实施计划（showcase-page）

1. 新建路由 `app/showcase/page.tsx`（server component）+ 作用域样式 `app/showcase/showcase.module.css`（CSS Module）。
2. 二维码资产：生成并验证 1024px / 纠错 H 级的 `findjoy-qr.png`，放入 `public/findjoy-qr.png`（原图直出，不经图片优化，保证扫码精度）。
3. 文案取材产品文档：主标题、价值段落、三支柱（出生/选择/回望）、产品宪法金句、页脚原则。
4. 视觉：纸色底 + 墨色 + 橙色句点；海报式细线外框；呼吸光晕提示二维码可扫；`prefers-reduced-motion` 降级。
5. 响应式：16:9 会场大屏两栏（左文案右二维码，二维码约 42vh）；≤860px 堆叠且二维码优先；短视口（max-height 820px）收紧间距保证一屏。
6. 附带：新增 `app/icon.svg`（品牌 favicon，消除全站 favicon 404）。
7. 验证：typecheck / test / lint / build + 无头浏览器多视口 QA（1920×1080 / 1366×768 / 390×844 / 280×653），无横向溢出、二维码尺寸达标、图片字节与原文件一致。
