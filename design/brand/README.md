# FindJoy 品牌图片资产

供视频剪辑、封面、外部物料使用。全部为透明背景 PNG，由站内品牌资产渲染而来：
字标来自 `public/findjoy-logo.svg`，图标来自 `app/icon.svg`（栏目 `app/icon.svg` 同时用于 favicon）。

字体：DM Sans 600，字距 -0.06em；品牌色：墨 `#11110f`、纸白 `#f8f8f6`、橙 `#ff5a1f`。

## 字标（findjoy.）

| 文件 | 尺寸 | 用在什么底色上 |
| --- | --- | --- |
| `findjoy-logo-ink.png` | 4817 × 1573 | 浅色 / 纸白背景（默认） |
| `findjoy-logo-paper.png` | 4817 × 1573 | 墨黑、深色照片、深色视频 |
| `findjoy-logo-white.png` | 4817 × 1573 | 任意深色背景（纯白替代纸白） |
| `findjoy-logo-on-white.png` | 5097 × 1853 | **自带白色背景**（#ffffff），四周 140px 留白，可直接叠在任意画面上 |

句点的橙色在所有变体里保持不变，不要改成背景色或白色。

## 图标（f + 橙点）

| 文件 | 尺寸 | 用途 |
| --- | --- | --- |
| `findjoy-icon-1024.png` | 1024 × 1024 | 高清图标、封面角标 |
| `findjoy-icon-512.png` | 512 × 512 | 一般使用 |
| `findjoy-icon-180.png` | 180 × 180 | Apple touch / 小尺寸 |
| `findjoy-mark-1024.png` | 704 × 768 | 只有 f 与橙点、没有纸白圆角方底，用于叠加在任意画面 |

图标自带的纸白圆角方底不要再去掉圆角或改底色；需要透明叠加时用 `findjoy-mark-1024.png`。

## 使用注意

- 等比缩放，不拉伸、不加描边/阴影/渐变。
- 字标四周留白至少为字高的 1/4，不要裁到 `j`、`y` 的下伸部分。
- 这些是导出物；要改设计请改 `public/findjoy-logo.svg` 与 `app/icon.svg` 后重新导出。
