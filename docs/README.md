# 文档索引

`docs/` 保存 FindJoy 的产品定义、开发规格、设计过程与示例记录。代码之外的“为什么这样做”优先放在这里。

## 产品

| 文档 | 说明 |
| --- | --- |
| [MVP 产品开发文档 v0.1](./product/mvp-product-spec-v0.1.md) | 产品定位、核心命题、玩法与体验原则，是项目的核心产品真理文档 |
| [玩法模式产品定义 v0.1](./product/game-modes-v0.1.md) | 普通/主题/剧本/ForU 四种并列玩法、音乐、付费扩展点与验收原则 |

## 规格与计划

| 文档 | 说明 |
| --- | --- |
| [玩法模式与背景音乐实施规格](./specs/2026-10-27-game-modes-implementation.md) | 模式架构、开局 API、提示词、音频层、测试与后续扩展 |
| [觅乐书签开发规格](./specs/2026-10-11-bookmarks.md) | 内容分享栏目的范围、数据维护方式与验收标准 |
| [模型配置双模式设计](./specs/2026-08-22-model-config-design.md) | 本地文件配置与线上环境变量锁定的设计 |
| [模型配置实施计划](./plans/2026-08-22-model-config.md) | 上述设计的任务拆解与测试顺序 |

## 设计系统

| 文档 | 说明 |
| --- | --- |
| [FindJoy 设计系统](../design/DESIGN.md) | 正式设计语言、品牌字标、Owner 偏好、组件和响应式规则 |
| [语义 Tokens](../design/tokens/tokens.json) | 配色、字体、间距、圆角、阴影、密度与动效的数值来源 |
| [组件基础 Showcase](../design/showcase/index.html) | 可直接打开的静态组件与状态展示，含积分说明弹窗 |
| [设计语言提取记录](../design/references/ui-audit.md) | 现有页面来源、原品牌页保留方式、旧目录清理与待迁移项 |
| [展示页图片来源](../design/references/showcase-image-attribution.md) | 保留仍使用素材的原始来源与许可记录 |

原品牌页 `/findjoy/brand` 和 `app/brand/page.tsx` 保留，已纳入设计系统的品牌章节。早期设计简报/预览/验收截图目录按 Owner 要求清理，历史版本可在 Git 中查阅；新规范不代表当时或当前的视觉验收报告。

## 示例记录

以下记录由真实模型推演生成，用于检查叙事质量和事件节奏。人物均为虚构身份，不代表真实个人。

| 文档 | 说明 |
| --- | --- |
| [一局人生：0 → 42 岁](./examples/sample-life-42.md) | 14 次生成、从出生推进到 42 岁的完整记录 |
| [一局人生的前十年](./examples/sample-life-first-decade.md) | 10 轮实时生成、推进到 10 岁的早期记录 |

## 其他

- [部署指南](../DEPLOY.md)
- [贡献指南](../CONTRIBUTING.md)
- [安全策略](../SECURITY.md)

- [人生 AI 引擎维护约定](development/ai-engine.md)：模块边界、提示词预览、JSON 协议变更与模式扩展。

- [个人开发调试工具](development/developer-tools.md)：节点预览、自助积分、私人测试支付及权限边界。
