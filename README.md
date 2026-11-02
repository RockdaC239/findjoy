# FindJoy · 觅乐

<p align="center">
  <img src="./public/findjoy-logo.svg" alt="findjoy. 主标志" width="260" />
</p>

<p align="center">
  <a href="https://github.com/RockdaC239/findjoy/actions/workflows/ci.yml"><img src="https://github.com/RockdaC239/findjoy/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
  <a href="./LICENSE"><img src="https://img.shields.io/github/license/RockdaC239/findjoy" alt="License: MIT" /></a>
  <img src="https://img.shields.io/badge/node-%3E%3D22-417e38" alt="Node.js >= 22" />
</p>

FindJoy 是一款由 AI 驱动的人生模拟游戏。你从人生的某个起点开始，在关系、工作、家庭、健康、金钱和自我实现之间不断做出选择，直到生命结束，再回望这一生。

它不提供“人生成功分数”，也不替你判断什么样的人生才是正确答案。每一次选择、每一段关系、每一个遗憾，都只构成一面关于你自己的镜子：

> 如果这是你真实的一生，你愿意这样活吗？

## 核心体验

- **四种并列玩法**：普通人生（随机出身，从 0 岁开始）、主题人生（爱情/亲情/事业主线）、剧本人生（年代短剧与固定开局）、ForU 人生（以你写下的当前人生为起点）。
- **同一个核心循环**：四种模式共享事件、选择、客观变化、死亡与回顾；模式只改变情境和叙事侧重，不改变“不评判人生”的原则。
- **选择推动故事**：AI 根据你过去的经历和当前处境生成下一段人生事件，而不是套用固定模板。
- **没有统一评分**：人生回顾只整理关键选择、关系、健康、财务与未竟之事，不给出“成功/失败”结论。
- **可以停下来再继续**：未完结的人生保存在本地 SQLite 中，下次打开可以继续，并沿用原模式与情境。
- **可关闭的背景音乐**：程序化环境音随阶段、模式和事件类型变化，默认开启，首次交互后发声，偏好会被记住。
- **可选的内容分享**：「觅乐书签」收录关于幸福、人生意义与如何生活的外部内容。

## 技术栈

- [Next.js 16](https://nextjs.org/) App Router + React 19
- TypeScript
- [Vitest](https://vitest.dev/) 领域行为测试
- SQLite（`better-sqlite3`）保存人生状态
- 任意兼容 OpenAI `/chat/completions` 的模型服务

## 快速开始

### 环境要求

- Node.js **22 或更高版本**（`better-sqlite3@13` 的要求）
- npm（仓库提供 `package-lock.json`）

### 安装与运行

```bash
npm ci
npm run dev
```

打开 <http://localhost:3000/findjoy>。项目使用 `basePath: /findjoy`，所以本地访问也需要带 `/findjoy` 前缀。

### 配置模型

本地开发模式下，点击页面右上角「模型设置」，填写供应商、API Key 和模型，保存即可。配置由本地服务端写入：

```text
.data/model-config.json
```

`.data/` 已加入 `.gitignore`。API Key 只用于本地服务端请求，不会写入人生数据库、日志或返回给浏览器。供应商与推荐模型目录见 [`lib/provider-catalog.ts`](./lib/provider-catalog.ts)。

如果希望改用环境变量，可复制 [`.env.example`](./.env.example) 为 `.env.local`：

```env
FINDJOY_MODEL_CONFIG_MODE=environment
LLM_PROVIDER=deepseek
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=your-api-key
LLM_MODEL=deepseek-chat
```

生产环境默认使用环境变量模式，并忽略浏览器传来的自定义模型配置。线上页面会展示“服务端环境变量”状态，用户不能修改模型。不要把真实 Key 写入仓库。

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `npm run dev` | 启动本地开发服务器 |
| `npm run build` | 创建生产构建 |
| `npm start` | 启动生产构建 |
| `npm test` | 运行 Vitest 领域测试 |
| `npm run typecheck` | 运行 TypeScript 类型检查 |
| `npm run lint` | 运行 ESLint |

登录和账户集成测试需要独立 PostgreSQL 测试库，通过 `TEST_DATABASE_URL` 显式提供；不要使用生产数据库。测试会在该库内创建并清理随机 schema，不隐式读取生产 `DATABASE_URL`。CI 已配置 PostgreSQL 15 测试服务。本地需先启动测试实例并创建测试库，再设置环境变量，例如：

```bash
export TEST_DATABASE_URL='postgresql://findjoy_test@127.0.0.1:55439/findjoy_test'
```

上例适用于已初始化的本机测试实例，数据库账号和端口按实际配置填写。未提供测试连接时，登录相关测试会明确失败，不会静默跳过。

提交改动前，请确保以下命令全部通过：

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

## 项目结构

```text
app/                页面、布局与 API 路由
components/         可复用的 React 组件（模式选择、音乐开关等）
lib/                人生状态、事件生成、模型适配、模式目录、音频与书签数据
lib/modes/          四种玩法的类型、目录、情境归一化与开局逻辑
public/             静态资源
docs/               产品文档、技术规格、设计过程与示例记录
deploy/             部署执行脚本
scripts/            服务器初始化脚本
```

关键入口：

- 首页与游戏流程：[`app/page.tsx`](./app/page.tsx)
- 模式选择 UI：[`components/ModeLauncher.tsx`](./components/ModeLauncher.tsx)
- 产品原则与核心玩法：[`docs/product/mvp-product-spec-v0.1.md`](./docs/product/mvp-product-spec-v0.1.md)
- 四种玩法定义：[`docs/product/game-modes-v0.1.md`](./docs/product/game-modes-v0.1.md)
- 模式目录：[`lib/modes/catalog.ts`](./lib/modes/catalog.ts)
- 模型适配层：[`lib/model-adapter.ts`](./lib/model-adapter.ts)
- 人生状态与存档：[`lib/life-store.ts`](./lib/life-store.ts)
- 背景音乐：[`lib/ambient-music.ts`](./lib/ambient-music.ts)、[`lib/music-scene.ts`](./lib/music-scene.ts)
- 觅乐书签：[`app/bookmarks/page.tsx`](./app/bookmarks/page.tsx)、[`lib/bookmarks.ts`](./lib/bookmarks.ts)

## 文档

| 文档 | 内容 |
| --- | --- |
| [产品开发文档](./docs/product/mvp-product-spec-v0.1.md) | 产品定位、核心玩法与体验原则 |
| [玩法模式产品定义](./docs/product/game-modes-v0.1.md) | 四种模式、音乐、付费扩展点与验收原则 |
| [模式实施规格](./docs/specs/2026-10-27-game-modes-implementation.md) | 模式架构、开局 API、提示词、音频层与测试 |
| [文档索引](./docs/README.md) | 规格、计划、设计稿与示例记录 |
| [觅乐书签规格](./docs/specs/2026-10-11-bookmarks.md) | 内容分享栏目的范围与验收标准 |
| [模型配置设计](./docs/specs/2026-08-22-model-config-design.md) | 本地/线上模型配置双模式 |
| [部署指南](./DEPLOY.md) | 腾讯云 + GitHub Actions 部署流程 |

## 参与贡献

FindJoy 是一个开放的实验项目，欢迎提交 Issue、内容建议和 Pull Request。你可以从文案、人生事件设计、模型适配、可访问性、测试和部署体验等方向参与。

开始之前请阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 和 [AGENTS.md](./AGENTS.md)。提交 PR 时请说明改动动机、用户可见变化和验证命令；涉及模型提示词、模型配置或数据持久化的改动，请明确标注。

## 安全

如果你发现安全问题，请不要公开提交 Issue，参考 [SECURITY.md](./SECURITY.md) 私下联系维护者。API Key 等同于账户凭证，请勿提交 `.data/model-config.json`、`.env.local` 或真实 Key。

## License

[MIT](./LICENSE) © FindJoy contributors
