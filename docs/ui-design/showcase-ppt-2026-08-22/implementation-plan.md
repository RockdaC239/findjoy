# 实施方案（implementation-plan.md）

## 目标
将 app/showcase 从单页海报改造为 9 页全幅沉浸式幻灯片（方向 B）：
8 页叙事（第 1 页浓缩要点，其余按用户要求精简/合并/删除，保留原文逐字）+ 1 页结尾（现有海报页原样保留为结尾页）。仅手动翻页（用户已确认）。

## 文件变更
1. **public/deck/**（新增）— 复制 8 张主选配图（deck-01-idea.jpg … deck-08-heart.jpg，来自 references/images/，均为 Wikimedia Commons 自由许可图片）。
2. **app/showcase/ShowcaseDeck.tsx**（新增，客户端组件 "use client"）— 幻灯片容器与交互：
   - 状态：当前页 index；翻页：方向键/空格/PageUp/PageDown/Home/End、点击左右半屏、滚轮（节流 650ms）、触屏滑动（阈值 40px）。
   - 渲染 9 页；页码/进度条 HUD（当前/总数 + 顶部或底部进度条）。
   - 键盘事件挂 document（keydown），组件卸载时清理；prefers-reduced-motion 时关闭动画。
   - 结尾页复用现有海报结构（标题/价值段落/三支柱/金句/二维码卡片/页脚）。
   - 图片加载失败时隐藏图片层（onError），文字仍完整可读。
3. **app/showcase/page.tsx**（改）— 保留服务端组件以导出 metadata，改为渲染 <ShowcaseDeck/>；文案数据移到 Deck 内（叙事 8 页 + 结尾页）。
4. **app/showcase/showcase.module.css**（改）— 新增 deck 样式（slide、bg、veil、content、hud、progress、responsive），保留/复用结尾页现有样式；删除不再需要的整页滚动布局样式。

## 文案拆页（8+1）
| # | 标题 | 配图 |
|---|------|------|
| 01 | 突然我就有了一个idea……（原文整段） | deck-01-idea.jpg |
| 02 | 它和市面上绝大多数的人生模拟器不一样 | deck-02-thickness.jpg |
| 03 | 核心，是一次又一次的决策 | deck-03-decisions.jpg |
| 04 | 根据用户的过往经历，以及当下所做的决定，来实时推演下一个节点发生的事。 | deck-04-nodes.jpg |
| 05 | 从而推动用户再次做出决策。 | deck-05-loop.jpg |
| 06 | 每一个决策都会把用户推向不同的人生方向……做平衡、做抉择。 | deck-05-directions.jpg |
| 07 | 所有选择都没有对错……找到幸福。 | deck-06-path.jpg |
| 08 | 大富大贵不等于幸福……那幸福是什么呢？ | deck-07-happiness.jpg |
| 09 | 答案在每个体会过多种人生的用户心里…… | deck-08-heart.jpg |
| 10 | 而这便是findjoy的意义所在。 | deck-10-meaning.jpg |
| 11 | 人生没有答案，只有选择（现有海报 + 二维码） | — |

## 响应式策略
- 大屏（≥1440）：clamp 放大字号，16:9 优先。
- 笔记本（1366×768）：字号自适应，图文不重叠。
- 手机（390×844 / 280×653）：图片压暗更深保证文字对比度，字号 clamp 缩小，触屏滑动翻页。
- 每页 100svh（小屏用 100svh），内容垂直居中，禁止页面级滚动。

## 无障碍
- 每页 slide role="region" aria-label 页名；HUD 用 aria-live 播报页码；焦点管理不强制。
- 动画尊重 prefers-reduced-motion；键盘焦点可见（默认 focus ring 保留）。

## 验证
1. npm run typecheck / lint / test / build 全部通过。
2. Playwright 截图 4 断点（1920×1080、1366×768、390×844、280×653），覆盖第 1/4/9 页。
3. 程序化审计：图片全部加载、body 无横向溢出、各页高度=视口、页码计数正确、翻页快捷键可前进后退。
4. 截图与审计结果存档到 final-screenshots/ 与 qa-report.md。

## 风险与对策
- 大屏文字对比度不足 → 墨色渐变遮罩加深 + 文字加 text-shadow。
- 图片 1920px 在 4K 屏略软 → 可接受（duotone 处理掩盖细节损失）；如需要后续换 3840px 原图。
- Next 客户端组件 metadata 限制 → 拆 page.tsx（服务端 metadata）+ Deck.tsx（客户端）。
