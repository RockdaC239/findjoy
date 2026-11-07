# 模型提示词维护入口

发给模型的写作指令、模式规则、动态指令模板、格式示例与重试纠正内容集中在本目录。TS 负责选择、插值、组织事实和校验，不维护创作指令正文。

分层与组装顺序见 [`docs/development/prompt-layers.md`](../../../docs/development/prompt-layers.md)。简单说：`craft.md` 管跨阶段写法，`two-scene.md` 管每轮事件协议，`opening.md` 只管开篇，`era.json` 只管默认时代；动态片段放 JSON。

| 资源 | 内容 |
| --- | --- |
| `craft.md` | 新版通用叙事设计：清楚、场面、人物、对白、选择代价、连续性 |
| `two-scene.md` | 新版每轮事件：narration/story 分工、时间、寿命、死亡、输出契约与状态更新 |
| `opening.md` | 新版普通/主题童年开篇 overlay |
| `ending.md` | 人生回顾与分享表达 |
| `era.json` | 普通/主题（含 v2 兼容）与 v3 ForU 的默认时代上下文；剧本年代仍在 `mode-catalog.json` |
| `adult.md`、`childhood.md` | 旧版人生兼容规则 |
| `assembly.json` | 张力轮换、阶段过渡、开篇恢复 |
| `turn.json` | 每轮节奏、连续性、优先级、寿命提醒、回顾证据与重试包装 |
| `birth.json` | 出生事实边界、年龄与班次要求、开局场景候选 |
| `background.json` | 家境、结构与开局基调说明 |
| `storyline.json` | 跨局/单局防重复与近期处境提醒 |
| `modes.json` | 主题、剧本、ForU 的事件、开场和回顾指令 |
| `mode-catalog.json` | 模式、主题、时代和剧本内容目录，含既有产品展示资料 |
| `examples.json` | 插入基础提示词的输出格式和叙事示例 |
| `retry.json` | 事件/回顾格式纠正与重复价值轴纠正 |

## 两条硬约束

- **具体场景先抽象，再写提示词。** 调试某个具体场景（例如民办公办）时，不要把场景里的机构、金额、人物关系、对白或标题示例直接写进 `craft.md` / `two-scene.md` / `opening.md`。先把问题总结成通用规则，放进正确层；具体样本放测试、审计或试玩文档。`craft` 会进入所有模式和年代，带入某一局的具体机构会造成过拟合和年代错位。详见[提示词分层设计](../../../docs/development/prompt-layers.md#具体场景问题必须抽象化)。
- **v3 固定 3 个选项。** v2 旧人生保留 2～3 兼容；v3 的 `craft`、`two-scene`、`opening` 与契约都必须按 3 个写，第三个必须是第三种真实行动和代价，不能是折中或拖延。

JSON 中 `{{name}}` 表示动态变量。调用方以 `renderPrompt(template, values)` 一次替换；变量缺失直接报错。插入的用户资料不会再次按模板解释，包含 `{{...}}` 或 `$&` 的内容仍是原始资料。JSON 的换行写成 `\n`，不要改变本来有意义的段落和字段顺序。

`assemble.ts` 选择基础文本和附加片段；`template.ts` 只做插值。`context.ts` 组织 system/历史/current user；出身、模式等模块提供已验证的事实及模板变量。输出解析、年龄推进、权限和数据校验仍由 TS 管理；业务枚举、用户资料和校验错误描述不是创作指令。

修改前预览完整组装请求：

```sh
npm run prompt:preview -- --mode normal --stage opening
npm run prompt:preview -- --mode normal --stage next
npm run prompt:preview -- --mode normal --stage ending
npm run prompt:preview -- --experience-version 2 --stage opening
```

预览只使用合成资料。提示词不是只有某个 Markdown 文件：需同时检查动态模板和每轮任务。Markdown 在模块加载时读取，修改后需重启已有开发进程再试玩。JSON 使用静态导入，由构建工具追踪，不能在前端可达的组装模块中改成 `node:fs` 读取。

2026-11-07 的分层调整把通用写法抽到 `craft.md`，把每轮协议留在 `two-scene.md`，把开篇结构留在 `opening.md`，把默认年代抽到 `era.json`；`opening.md` 不再重复写法、代价与年代。v3 由 `craft + two-scene` 组成基础，再按模式追加时代、出身、模式和动态片段；v2 的 `adult.md`、`childhood.md` 不继承新 craft，避免旧人生半路变风格。修改 Markdown 后仍需重启已有开发进程，并用预览检查完整组装请求。
