# 人生 AI 引擎维护约定

## 2026-11-06 两幕体验 v3

新人生使用 `experienceVersion=3`，一次事件生成返回 `narration`（上次选择的结果与生活）及 `story/choices`（下一决策）。普通/主题从 0 岁建状态，一次开局讲述到 15 岁决策入口；后续允许同龄回应。终点只有最后讲述，无下一决策。旧人生继续 v2，不混写协议或重生历史。

新提示词维护于 `prompts/two-scene.md`；`MODEL_OUTPUT_VERSION=3` 表示最新协议，实际分流依赖服务端人生版本。原有 adult/childhood 及基线为旧人生保留，不为新体验修改旧文本。`npm run prompt:preview -- --experience-version 2` 检查 v2；缺省检查 v3，`--legacy` 仍仅控制转录与 history 路径。

讲述与决策同一个 `LifeEvent` 保存，真实选择仍挂上一节点；回顾后果从后一节点的 narration 读取。完整保存后才允许进入下一决策。讲述展示、阅读游标、最终讲述/告别/回顾分工及验收详见[体验优化方案](../product/experience-optimization-v0.1.md)。以下 v2 章节保留为旧流程说明。

引擎保持四种玩法共享结构。2026-11-03 后续更新已增加模型主导的生命终点与告别交互，见下方 v2 说明。

## 模块与依赖

```text
API 路由：鉴权、选项校验、生成准入、事务保存、SSE
  → engine/generate.ts：生成、校验、修复、重试、兜底
      → context.ts：状态/历史消息、阶段与模式指令的组合
          → prompts/assemble.ts + prompts/*.md：基础文本与指令拼接
          → modes/：玩法情境、开场、主题、回顾指令
      → model-client.ts：供应商配置、HTTP、流式数据、超时
      → event-contract.ts：未知 JSON → 内部 NextEvent / LifeEnding
      → fallback.ts：本地兜底事件
  → life.ts：内部事件 → LifeState
```

- `output-format.ts`：模型输出类型和格式/叙事示例，Markdown 用占位符插入，避免重复维护 JSON 示例。
- `stream-contract.ts`：浏览器对尚未完成的 JSON 做渐进读取，无服务端依赖；字段改变时与完整解析一起调整。
- `phase.ts`：童年与决策阶段的共享年龄边界。
- `preview.ts`：仅构造合成状态，复用正式消息组装；不读存档、不读模型密钥、不请求模型。
- 原 `lib/model-adapter.ts`、`lib/stream-event.ts` 保留兼容导出，已有调用方与测试 mock 无需迁移。新增实现直接在对应模块维护。

调用模型和推进人生是两件事：模型返回值先校验转换成内部事件，再由 `life.ts` 更新状态。模式共享同一 LifeState 和事件循环，仍通过 `scenario` 保存情境。

## 审查、修改提示词

1. 修改 `lib/engine/prompts/adult.md`、`childhood.md` 或 `ending.md` 的叙事要求。`##` 章节标题仅供审阅，组装时移除；`{{adultFormat}}` 等占位符来自 `output-format.ts`。
2. 玩法差异继续编辑 `lib/modes/scenario.ts` 与玩法目录；出身与防重分别由 `background.ts`、`storyline.ts` 提供。动态指令没有复制成另一套文本源。
3. 用预览命令审查合成资料下的完整消息，包括 system、历史 user/assistant 与当前 user。最终应审查组合后的消息，而不仅是基础文本。
4. 文本在模块加载时读取，修改后需重启已有开发进程。生产变更依照正常构建、验收与发布流程；Markdown 文件已加入 Next 输出追踪。

```bash
npm run prompt:preview
npm run prompt:preview -- --mode normal --stage next
npm run prompt:preview -- --mode theme --theme family --stage next
npm run prompt:preview -- --mode script --script 1980s-factory-succession
npm run prompt:preview -- --mode foru
npm run prompt:preview -- --mode foru --stage ending
npm run prompt:preview -- --mode normal --stage next --legacy
npm run --silent prompt:preview -- --mode theme --theme love --json
```

`--stage` 为 opening/next/ending；`next` 用合成成年节点演示一次选择后的请求，不是从开局自动推演出的真实剧情。`--json` 输出完整 messages 数组，便于本地比较；预览工具使用现有 Vitest 依赖中的 vite-node，没有新增依赖。命令不接受用户存档文件或真实 ForU 简介。

`prompt-baseline.json` 记录本次拆分前童年、成人、结局基础提示词的 SHA-256，用来验证本次重构没有改变请求文本。今后有意调整提示词时，先审阅预览差异，再更新对应基线并与文本一起提交；哈希仅验证文本一致性，不代表质量评估。

## 修改模型返回 JSON

当前模型输出协议为 v2，`MODEL_OUTPUT_VERSION` 在 `output-format.ts` 中维护。没有给现有存档或转录追加版本字段；旧转录保留原格式；新转录保存 outcome/deathCause，旧事件缺少 outcome 默认 continue，无需迁移历史消息。

按以下边界检查，不直接让模型 JSON 成为存档：

1. `output-format.ts`：修改模型输出类型、格式示例、叙事示例。
2. `event-contract.ts`：更新诊断、规范化、修复、重试纠正指令及转录序列化；把新输出转换到内部事件。
3. `stream-contract.ts`：如调整故事/标题/选项的字段名或嵌套位置，同步渐进读取；字段输出顺序影响玩家何时看见内容。
4. 提示词 Markdown 及模式指令：核对文字说明是否仍与字段一致。
5. 内部 `NextEvent` 能表达新输出时，保持 `LifeState`、页面和 API 不变；确实增加人生事实时，再独立设计状态更新、展示与存档兼容。
6. 不兼容版本升级必须处理已有 assistant 转录：明确转换旧消息或重建兼容上下文，不能只升级新响应解析、继续混入旧转录。旧存档没有转录时，保留 history 路径。

格式示例、运行时校验及 TypeScript 类型并非自动生成关系；字段变更必须用往返转换与流式读取测试共同验证。当前不引入 schema 库或通用协议迁移框架。

## 新增模式

先在现有 modes 体系中增加情境类型、目录、起始状态、情境/开场/回顾指令。内容型模式复用统一生成流程，不修改 HTTP 或解析代码。

如果新模式确实改变是否给选项、时间推进等规则，再在 `context.ts` / `generate.ts` 中补充必要的明确分支；不预先建设通用生命周期钩子。涉及 LifeState 的业务规则继续归 `life.ts`，不让提示词替代硬约束。

验收包括开局、事件顶栏、历史标签、恢复、回顾问题和旧存档。测试使用合成资料和本地独立 PostgreSQL；真实模型的叙事质量、延迟与成本需要另行评估。

## 验证

- `lib/engine/prompts/assemble.test.ts`：三类基础提示词与已审阅基线一致。
- `lib/engine/modules.test.ts`：四种情境、追加转录、旧 history、协议往返及渐进展示。
- `lib/engine/preview.test.ts`：合成预览确定性、各阶段、CLI 输出和非法参数。
- 现有 `model-adapter.test.ts`、模式测试、生成路由与存档测试继续覆盖原调用入口。

提交前运行 `npm test`（需独立 `TEST_DATABASE_URL`）、`npm run typecheck`、`npm run lint`、`npm run build`。功能涉及前端告别与个人调试界面，不涉及生产发布。


## v2 生命终点

`outcome: death` 直接转换为 `dead: true`，死因落入 `flags.deathCause`，当前历史节点记录终点与空选项。省略 outcome 的旧响应视为 continue；未知死因本地归为 other。死亡事件不再因选项不足、价值轴或题材防重而重试，误带选项本地清空。只有结构不完整等格式/网络问题仍走异常恢复。

`life.ts` 不再随机决定死亡，也不按 95 岁或健康归零强制结束。早逝与长寿由提示词指导模型根据经历、选择、健康与偶然性推演，实际分布尚需真实模型样本评估。

`ReviewExperience` 同时挂载隐藏的回顾请求与可见的 `Farewell`。回顾结果到达且告别播放结束后展示回顾；可提前点击回望，失败可重试，刷新仍从已保存的人生终点恢复。基础色与动效遵循现有设计系统。

## 2026-11-04 引擎升级补充

事件协议v2现增加向后兼容的可选narrative更新（活跃方向、最多4人物、3事项及来源事件），以及city/education/父母分项状态/子女/朋友/病史快照。见`lib/engine/narrative.ts`；current来源仅在applyNextEvent保存事件时映射真实ID，非法来源丢弃，路由转录也使用已接纳来源。旧存档缺省不迁移、不重生。

当轮请求增加近期实际选择、处境提醒和阶段缺省字段提醒；职业题材防重改为软提示，不再禁止玩家回归旧业。基础提示词包含因果、人物诉求、真实回报与阶段格式，改文案须重启既有开发进程并检查preview。不要让运行中的next dev与next build共享输出造成加载版本不明。

回顾增加可选reflection/shareLines/evidenceEventIds及usage；无有效来源时清除新长文/分享字段并保留旧patterns兼容。引用ID有效并不证明解释准确。回顾保存累计已报告用量，供应商没返回usage仍无法准确计费。生产诊断只输出白名单元数据，避免记录正文。

海报绘制用户选中且经基础过滤的公开短句、至多三个跨度最大的重要节点（`review.moments`）与品牌；短句没有候选时用品牌文案，不绘制完整 observation 或 question。2026-11-04 Owner 确认节点可以作为分享内容，分享前预览即用户确认；旧回顾没有 moments 时只显示短句。实际质量与未解决风险见[真实验证报告](./ai-engine-upgrade-validation-2026-11-04.md)，本次没有生产发布。
