# 人生 AI 引擎维护约定

本次是职责拆分，保持现有四种玩法、模型请求参数、提示词内容、事件协议与存档结构。没有增加新的玩法或模拟规则。

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

当前模型输出协议为 v1，`MODEL_OUTPUT_VERSION` 在 `output-format.ts` 中维护。没有给现有存档或转录追加版本字段；现有转录仍沿用原格式。

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

- `lib/engine/prompts/assemble.test.ts`：三类基础提示词与重构前字节一致。
- `lib/engine/modules.test.ts`：四种情境、追加转录、旧 history、协议往返及渐进展示。
- `lib/engine/preview.test.ts`：合成预览确定性、各阶段、CLI 输出和非法参数。
- 现有 `model-adapter.test.ts`、模式测试、生成路由与存档测试继续覆盖原调用入口。

提交前运行 `npm test`（需独立 `TEST_DATABASE_URL`）、`npm run typecheck`、`npm run lint`、`npm run build`。本次不修改前端界面，不涉及生产发布。
