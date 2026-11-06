# 模型提示词维护入口

发给模型的写作指令、模式规则、动态指令模板、格式示例与重试纠正内容集中在本目录。TS 负责选择、插值、组织事实和校验，不维护创作指令正文。

| 资源 | 内容 |
| --- | --- |
| `two-scene.md` | 新版事件基础叙事与两幕契约 |
| `opening.md` | 新版普通/主题童年开篇 |
| `ending.md` | 人生回顾与分享表达 |
| `adult.md`、`childhood.md` | 旧版人生兼容规则 |
| `assembly.json` | 时代背景、张力轮换、阶段过渡、开篇恢复 |
| `turn.json` | 每轮节奏、连续性、优先级、寿命提醒、回顾证据与重试包装 |
| `birth.json` | 出生事实边界、年龄与班次要求、开局场景候选 |
| `background.json` | 家境、结构与开局基调说明 |
| `storyline.json` | 跨局/单局防重复与近期处境提醒 |
| `modes.json` | 主题、剧本、ForU 的事件、开场和回顾指令 |
| `mode-catalog.json` | 模式、主题、时代和剧本内容目录，含既有产品展示资料 |
| `examples.json` | 插入基础提示词的输出格式和叙事示例 |
| `retry.json` | 事件/回顾格式纠正与重复价值轴纠正 |

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

此次拆分保持已有请求正文、顺序与边界不变，没有顺带消除原有文案冲突。比如 `birth.json` 的第一句年龄表述与 `opening.md` 的动作开场要求，仍需后续单独调整和验证。
