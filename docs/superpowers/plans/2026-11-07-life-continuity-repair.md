# 人生连续性修复 Implementation Plan

> **For agentic workers:** 按已批准的方案逐项执行，测试先行；当前线程继续实现，不并行编辑共享文件。

**Goal:** 修复最新完整人生暴露的数值、时序、玩家选择、记忆与终幕问题，并改善整局生活与情绪展开。

**Architecture:** 复用 v3 两幕与 LifeState。生成入口要求明确的新事实字段，解析后转换成旧存档兼容的 objectiveChanges；旧事件仍可读取。终点通过既有纠正重试生成，不拼接死亡文案。

**Tech Stack:** TypeScript、Vitest、现有模型适配器与 PostgreSQL。

**Spec:** 本会话用户批准的完整修复方案；问题证据为最新本地人生（仅本地，不复制玩家文本到 Git）。

## Global Constraints

- 在 test 分支开发；不发布、不改玩家历史存档、不增加依赖。
- 普通/主题零岁开局，剧本/ForU 保留现有情境；不增加统一分数。
- 程序保证可计算事实，语义与情绪必须用真实模型全局试玩检验，不声称自动理解全文。

## Task 1: 数值事实和时间协议

Files: lib/engine/event-facts.ts（新建）、event-contract.ts、output-format.ts、lib/life.ts、对应 tests。

- [x] 先写回归：还款归零、健康当前值、入股现金方向、越界收支与混用协议拒绝、时间范围与试行选择不能跳年。
- [x] 新生成要求 stateUpdate（现金收支/借还款/资产健康当前值）与 timeline（结果年龄、场景年龄）。旧事件不迁移。
- [x] 规范化后沿用既有增量应用；转录保持明确新事实，防止格式再被学错。
- [x] 保存入口复核时间与数值，测试旧协议兼容。

## Task 2: 完整终幕和叙事记忆

Files: lib/lifespan.ts、lib/engine/generate.ts、context.ts、narrative.ts、lib/life.ts、对应 tests。

- [x] 先写失败用例：上限普通事件拒绝、重试后完整终幕、终点清空待办、已故父母不活跃。
- [x] 每轮提供允许年龄范围与对应亲属年龄、生死状态；终点附近提供收束要求。
- [x] v3 到达上限但未死亡，纠正重试；耗尽后不推进，不拼接模板。
- [x] 清理确定已故父母的活跃记忆；死亡后不保留待操作方向和未决任务。

## Task 3: 生活、情绪与选择边界

Files: lib/engine/context.ts、prompts/craft.md、two-scene.md、turn.json、examples.json、retry.json。

- [x] 基于近期事件提供题材分布、重大损失事实与当前真实选择，防止工作/照护循环。
- [x] 对试行选项标记需跟进；讲述不代办长期承诺；生活过渡与关键场面保持充分篇幅。
- [x] 改写既有规则，鼓励关系变化、共同收获和情绪回响，避免叠加更多互相矛盾的要求。

## Task 4: 验证与交付

- [x] 用合成资料完整跑至少 3 局普通人生，逐幕审读；补测主题、剧本、ForU 与旧存档续玩。
- [x] 记录跨度、输出字数、延迟、重试和成本；记录语义限制。
- [x] npm test（独立本地测试库）、typecheck、lint、build，检查差异与文档。
- [x] 重启本地开发服务并检查健康与游戏入口；不触发生产发布。
