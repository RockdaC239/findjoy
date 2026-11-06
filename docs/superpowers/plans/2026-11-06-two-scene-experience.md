# 两幕人生体验实现计划

**Goal:** 新人生一次生成讲述与下一决策，童年一幕，完整支持终点与恢复；保留旧人生流程。

**Architecture:** 在现有 LifeState 中以 experienceVersion=3 固定新人生协议；每轮一个历史节点增加 narration，story 保留为下一决策。前端独立保存阅读游标，切幕不推进业务。

**Tech Stack:** Next.js App Router、React、TypeScript、PostgreSQL、Vitest；不新增依赖。

**Spec:** `docs/product/experience-optimization-v0.1.md` 第 8～13 节。

## 全局约束与裁定

- 已有 test 分支及本轮未提交设计文档，按仓库仅在 test 提交的约束原地实现，不建立其他分支，不发布。
- 15 岁是现有决策边界，普通开局从 0 岁建立；剧本/ForU 保留零时间起点，未开放模式不开放。
- 旧人生无版本标记继续 v2；现有鉴权、事务、扣费、租约不变。
- 暂取渐出后手动“进入下一幕”，始终可直接显示全文；微选择不加入首版，避免额外生成。
- 不使用截图题材作为内容样例；失败不伪造真实后果。

## Task 1：生成与状态契约

文件：`lib/life.ts`、`lib/engine/{output-format,event-contract,context,generate,fallback,preview}.ts`、prompts、`lib/modes/start.ts`、`lib/mock-life.ts` 与对应测试。

接口：`LifeState.experienceVersion?:3`、`NextEvent.narration?:string`、`LifeEvent.narration?:string`；新开局设置版本。v3 讲述非空，continue 有决策，death story 为空无选项。普通新开局时间 15，后续允许 0，旧路径保持。

- [x] 先新增开局、同龄回应、终点、转录与旧版本行为测试并观察失败。
- [x] 实现版本分流、输出校验及生成、提示词和 mock，保存时只应用一次变更。
- [x] 验证回顾后果读取 narration，预览可覆盖新旧协议；跑针对性测试。

## Task 2：渐进解析、视图与阅读游标

文件：`lib/engine/stream-contract.ts`、`lib/life-view.ts`、`lib/life-session.ts` 与测试。

接口：`StreamedEvent.narration?:string`；`LifeView.experienceVersion?:3`、`narration?:string`、`fromAge?:number`；`readLifeScene(lifeId,eventId)` / `rememberLifeScene(lifeId,eventId,scene)` / `clearLifeScene()`，scene 为 decision/farewell/review，缺省 narration。

- [x] 先测试分片/转义/嵌套/字段乱序、双正文恢复和游标错误/存储不可用场景。
- [x] 实现最小顶层 JSON 渐进读取，不把 narrative 人物或 threads 当作选项。
- [x] 实现视图字段和 sessionStorage 单条游标；不保存正文；跑针对性测试。

## Task 3：展示与路由衔接

文件：`app/play/page.tsx`、`components/LifeEventScene.tsx`、新增 `NarrationScene` 与局部样式、`ReviewExperience`、`Farewell`、review 路由及退出入口。

- [x] 添加 SSR 渲染/可运行交互测试，验证讲述无提前选项、决策切换与终点不重复。
- [x] 一次请求先讲述再决策，切幕无请求；死亡只在完整保存确认后转 review，在 review 展示最后讲述。
- [x] 支持全文/减少动效、阅读游标、刷新、错误恢复；使用现有设计 tokens。

## Task 4：集成、审查与提交

- [x] 针对性回归并执行 npm test、typecheck、lint、build、design:check；数据库使用独立测试库。
- [x] 委派独立代码审查，修复重要问题；更新设计文档当前落地状态与验证限制。
- [x] 确认 test 分支，提交本次改动和已授权设计文档，使用 feat:中文描述；不 push、不发布。
