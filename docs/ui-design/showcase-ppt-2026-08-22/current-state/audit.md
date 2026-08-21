# 现状审计（current-state/audit.md）

## 现状
- 路由：`app/showcase/page.tsx`（81 行）+ `app/showcase/showcase.module.css`（156 行）+ `app/showcase/ShowcaseLogo.tsx`。
- 形态：单页海报。左侧文案（eyebrow + 大标题「人生没有答案，只有选择」+ 价值段落 + 三支柱 + 金句），右侧白底二维码卡片；底部页脚三句话。`basePath=/findjoy`，二维码路径 `/findjoy/findjoy-qr.png`。
- 品牌：paper(#f8f8f6) / ink(#11110f) / orange(#ff5a1f)，DM Sans + DM Serif Display，细线分隔，句点锚点。
- 断点：1080 / 820（高度）/ 860 / 480，响应式已覆盖大屏→手机。

## 现状截图
- `current-state/screenshots/current-1920x1080.png`（2026-08-22 抓取，dev server localhost:3000）

## 需要保留
1. 品牌视觉系统与二维码卡片（结尾页原样保留）。
2. 结尾页所有文案（主标题、价值段落、三支柱、金句、页脚）——作为演示的最后一页。
3. 路由路径 `/findjoy/showcase`。

## 需要改变
1. 单页 → 9 页 PPT 式幻灯片（8 页叙事 + 1 页结尾）。
2. 叙事页需要配图（从 Wikimedia Commons 下载到本地）。
3. 需要翻页交互：键盘 / 点击 / 滚轮 / 触屏滑动，页码与进度条。
4. 页面级滚动应被幻灯片导航取代（各页 100svh，溢出内容以页为单位）。

## 风险
- 大屏文字过小时可读性差 → 字号用 clamp 放大，16:9 优先。
- 图片加载失败破版 → img 失败时隐藏容器，文字仍然完整。
- 手机端 9 页翻页体验 → 触屏滑动 + 字号自适应。
