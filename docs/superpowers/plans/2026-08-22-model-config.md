# 模型配置双模式 Implementation Plan

> **For agentic workers:** Implement this plan task-by-task with tests before production code.

**Goal:** 为 FindJoy 增加本地文件模型配置，同时保持线上模型由环境变量锁定。

**Architecture:** 新增服务端 `model-config` 模块，集中负责模式判定、配置文件读写和脱敏响应；模型适配器只消费解析后的配置。前端设置面板在本地模式调用配置 API，线上模式展示锁定状态。

**Tech Stack:** Next.js 16 App Router、TypeScript、React、Vitest、Node `fs/promises`。

---

### Task 1: 配置解析与本地文件存储

**Files:**
- Create: `lib/model-config.ts`
- Test: `lib/model-config.test.ts`
- Modify: `.env.example`

- [ ] 写测试覆盖本地配置文件读写、环境变量模式忽略请求配置、配置脱敏和非法 provider/model 拒绝。
- [ ] 运行 `npm test -- lib/model-config.test.ts`，确认测试因模块不存在或行为缺失失败。
- [ ] 实现 `getModelConfigMode`、`readLocalModelConfig`、`writeLocalModelConfig`、`resolveStoredModelConfig` 和脱敏类型。
- [ ] 重新运行目标测试并确认通过。

### Task 2: 接入模型适配器与 API

**Files:**
- Modify: `lib/model-adapter.ts`
- Create: `app/api/model-config/route.ts`
- Test: `lib/model-adapter.test.ts`

- [ ] 先增加测试证明 local 模式优先使用文件配置、environment 模式忽略请求配置。
- [ ] 运行目标测试确认失败。
- [ ] 让 `resolveModelConfig` 使用统一配置解析，并保持现有 catalog 模型成本计算。
- [ ] 新增 GET/PUT 配置接口：GET 返回模式和脱敏配置，PUT 只在 local 模式保存。
- [ ] 运行目标测试确认通过。

### Task 3: 前端设置面板

**Files:**
- Modify: `app/page.tsx`
- Modify: `app/globals.css`

- [ ] 加载配置 API，初始化本地表单；保存按钮提交 provider、apiKey、model 并刷新当前状态。
- [ ] 本地模式允许编辑，线上模式禁用输入并显示环境变量锁定提示。
- [ ] 仅把当前生效的非敏感模型配置传给人生请求；API Key 由服务端本地文件读取。
- [ ] 保持错误、加载和移动端布局可用。

### Task 4: 开源文档与验证

**Files:**
- Create: `README.md`
- Modify: `.env.example`

- [ ] 写明本地安装、设置面板、`.data/model-config.json`、环境变量线上部署、Key 安全边界和 PR 流程。
- [ ] 运行 `npm test`、`npm run typecheck`、`npm run lint`、`npm run build`。
- [ ] 检查 `git diff`，确认没有 API Key、无关改动或未跟踪配置文件。
