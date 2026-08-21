# QA 报告（qa-report.md）

## 范围
app/showcase 从单页海报改造为 9 页 PPT 式幻灯片（方向 B 全幅沉浸），2026-08-22 完成实施与验证。

## 验证结果
- `npm run typecheck` ✅（tsc --noEmit 无错误）
- `npm run lint` ✅（eslint 无错误）
- `npm test` ✅（8 文件 83 用例全部通过）
- `npm run build` ✅（/showcase 预渲染为静态页）

## 浏览器 QA（Playwright，Chromium 151）
56/56 检查通过，覆盖 4 断点：1920×1080（会场大屏）、1366×768（笔记本）、390×844（手机）、280×653（极窄屏）。

### 逐页结构
- 共 9 页：8 页叙事（暗底全幅图）+ 1 页结尾（原海报：纸白底 + 二维码），第 9 页与原海报视觉一致。
- 每页 100svh 固定，无页面级滚动（scrollY=0），无横向溢出（scrollWidth === innerWidth）。

### 交互矩阵（全部通过）
- 键盘：→/↓/PageDown/空格 前进、←/↑/PageUp 后退、Home/End 跳首尾。
- 点击：右半屏前进、左半屏后退；链接/按钮（开始体验）不触发翻页。
- 滚轮：前进/后退，700ms 节流防连跳。
- 触屏：横向滑动 40px 阈值翻页（代码路径，未在 CI 中模拟）。
- HUD：页码（01/09）、进度条（aria-valuenow 同步）、提示文字；结尾页自动切换墨色系。

### 图片
- 9 张图（8 张叙事配图 + 二维码）在全部断点加载成功（naturalWidth > 0）。
- 叙事配图统一暖调黑白（grayscale + sepia + saturate），与品牌一致。
- 图片加载失败时隐藏图片层、文字不破版（onError 兜底）。

### 结尾页适配（重点修复）
- 修复前：390×844 / 280×653 下海报内容超出一屏（1564px/1497px），且翻页手势会劫持原生滚动。
- 修复后：≤480px 隐藏三支柱与金句、压缩二维码与间距；≤340px 再隐藏 URL/提示。
- 结果：4 断点均一屏放下（scrollHeight === clientHeight），无需内部滚动；保留 overflow-y:auto 作为兜底，且结尾页溢出时翻页手势让位给原生滚动。

### 截图（final-screenshots/）
- venue-1920x1080 系列：venue-slide1 / venue-slide4 / venue-slide9-ending
- laptop-1366x768 系列：laptop-slide1 / laptop-slide4 / laptop-slide9-ending
- mobile-390x844 系列：mobile-slide1 / mobile-slide4 / mobile-slide9-ending
- tiny-280x653 系列：tiny-slide1 / tiny-slide4 / tiny-slide9-ending

## 已知限制
- 配图为 1920px 宽缩略图，4K 大屏下放大略软；如需可换 3840px 原图（Wikimedia 可生成）。
- 触屏滑动翻页经代码审查确认，未在自动化中模拟真实手势。
- 结尾页 ≤480px 隐藏了三支柱与金句（移动端以二维码与转化优先）。
