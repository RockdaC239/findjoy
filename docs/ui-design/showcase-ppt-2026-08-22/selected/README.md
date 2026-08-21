# 已选定方向

用户于 2026-08-22 选择 **方向 B · 全幅沉浸**（previews/preview-2.html）：
- 全屏图片铺底 + 墨色渐变遮罩，文字压图左对齐
- 配图统一暖调黑白（CSS filter）
- 仅手动翻页（键盘 / 点击 / 滚轮 / 触屏滑动）
- 结尾页保留原海报（人生没有答案，只有选择 + 二维码）
- 配图按主选执行（见 references/attribution.md）

实施产物：app/showcase/page.tsx（服务端，metadata）+ app/showcase/ShowcaseDeck.tsx（客户端交互）+ app/showcase/showcase.module.css + public/deck/ 8 张配图。
