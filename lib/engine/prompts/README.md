# 模型提示词维护入口

发给模型的写作指令、模式规则、动态指令模板、格式示例与重试纠正内容集中在本目录。TS 负责选择、插值、组织事实和校验，不维护创作指令正文。

分层与组装顺序见 [`docs/development/prompt-layers.md`](../../../docs/development/prompt-layers.md)。简单说：`craft.md` 管跨阶段写法，`two-scene.md` 管每轮事件协议，`opening.md` 只管开篇，`era.json` 只管默认时代；动态片段放 JSON。

| 资源 | 内容 |
| --- | --- |
| `craft.md` | 新版通用叙事设计：清楚、场面、人物、对白、选择代价、连续性 |
| `two-scene.md` | 新版每轮事件：narration/story 分工、时间、寿命、死亡、输出契约与状态更新 |
| `terminal.md` | v3可达生命终点时的完整终幕指令，覆盖普通续局出题规则 |
| `opening.md` | 新版普通/主题童年开篇 overlay |
| `opening-plan.json` | 普通模式开局方向目录与提示词：主要关系、推动力、故事机制、代价类型，以及"最近用过什么" |
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

2026-11-07 的开局多样性修复新增 `opening-plan.json`：服务端按目录抽一个四维方向（关系/推动力/机制/代价），随开局状态保存，只在普通模式的开局或开篇恢复轮注入；主题、剧本、ForU 和后续轮次都不注入，Mock 开局不抽样。目录权重把"发现特长""家庭安排""钱与开销"降权，近期用过的组合只降权不硬排除。

2026-11-07 的分层调整把通用写法抽到 `craft.md`，把每轮协议留在 `two-scene.md`，把开篇结构留在 `opening.md`，把默认年代抽到 `era.json`；`opening.md` 不再重复写法、代价与年代。v3 由 `craft + two-scene` 组成基础，再按模式追加时代、出身、模式和动态片段；v2 的 `adult.md`、`childhood.md` 不继承新 craft，避免旧人生半路变风格。修改 Markdown 后仍需重启已有开发进程，并用预览检查完整组装请求。

2026-11-07 续局体验调整：v3 不默认逐年出题；短期重要结果可同龄承接，稳定生活通常跨 2～5 年，连续同龄的小手续应收进过渡，不能把“慢”变成原地出题。讲述幕短期约 200～350 字，跨数年约 350～550 字，以选择后果、生活积累与关键场面承载情绪；开篇仍按自己的篇幅。`craft` 的强取舍要求只针对决策场面，讲述允许舒缓与余味。`recent_progress` 提供最近四幕的年龄与跨度供模型判断，不是程序强制跳年；首幕跨度未知时为 null。`objectiveChanges` 补充 `companyType` / `careerStage` 新值，保留现金、资产、债务与健康的增量语义，不迁移已有存档。

后续连续性修复补充：v3 新生成现在必须提供 `timeline`、`stateUpdate`、`lifeChanges`，选项含 `requiresFollowUp` 与 `commitments`。`stateUpdate.cashFlow` 记录 received/paid，`debtChange` 记录 borrowed/repaid，assets/physical 是当前值；解析后由程序转换为已有存档采用的增量。`objectiveChanges` 只保留其余事实新值，并补充 housing；旧事件继续按原语义读取，不批量迁移。格式有无歧义差异可规范化，但不能混用新旧数值协议。

`commitments` / `lifeChanges` 的允许值为 relationship、marriage、parenthood、housing、education、career。它们是选择权限与本幕事实的内部标记，不是新玩法或用户分数；新选项只声明文字明确授权的承诺。程序可依据已授权范围及实际变化补全冗余标签，不从故事猜玩家授权。试行选择必须同龄给出结果与跟进决定。旧选项没有标记时，仍按原文字和生成规则继续，不改历史选择。

每轮提供允许的年龄范围、各落地年龄的亲属年龄及当前生死状态；近期六幕明显收窄在工作经营或照护医疗时，对普通模式加强生活展开提醒，不强制改写主题与剧本，也不跳过未完成的试行或重大选择。到达寿命上限的 v3 普通事件将被拒绝并纠正重试；不再拼接模板死亡。重试带回上一份失败原稿和当前原因，原稿仅在请求内存中使用，不新增玩家内容日志。原有存档里已经发生的错误数值、年龄与叙事不自动修复。
