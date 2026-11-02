# Repository Guidelines

## FindJoy / FindFire 跨产品协作

Owner 当前单人创业，时间优先投入营销和产品迭代。技术选型以敏捷交付、少运维和总时间成本为先；默认优先成熟托管服务，不因具备部署能力就推荐自托管或提前建设基础设施。

涉及账号、全局 User ID、登录会话、付费权益、用户数据归属或跨产品部署时，先阅读[两产品关联与统一身份协作约定](docs/development/findjoy-findfire-shared-identity.md)。其中区分已实现现状、架构建议和待确认事项，不能将规划当成现有能力。两个产品共享身份方向，业务与收费独立。

主文档在 FindJoy 仓库，同路径在 FindFire 保留同步副本；修改跨产品契约时按文档同步两边，只有一个仓库可用时明确标记未同步。保留各产品自己的技术栈与业务规则，不擅自替换或合并。

## 生产发布约束

- 分支约定：日常开发在 `test`，开发提交及未完成功能不直接进入 `main`。Owner 明确确认发布范围后，再将已验收内容从 `test` 合并到 `main`，push `main` 触发 GitHub Actions 部署。创建或 push `test` 不代表授权发布；不得手动触发测试分支的生产部署。

- 开发、提交代码、测试支付或配置测试金额，不代表获得生产发布授权。未开发完成的功能不得为联调而发布到生产。
- 生产发布必须由 Owner 明确指定发布范围，并通过 GitHub push 触发仓库现有 GitHub Actions 流程；不得用 SSH 手动同步源码、切换服务目录或环境文件、重启服务来绕过发布流程。
- 测试默认在本地进行；需要公网回调时先准备本地穿透或独立测试环境，不得擅自替换生产版本。涉及共享域名与 nginx 时，同时保护 FindFire 路由。
- 如需紧急回滚或其他线上修复，明确说明范围与原因；不得把一次纠正误发布的回滚当成今后可手动部署的授权。

## Project Structure & Module Organization

Treat [`docs/product/mvp-product-spec-v0.1.md`](./docs/product/mvp-product-spec-v0.1.md) as the core product source of truth, and [`docs/product/game-modes-v0.1.md`](./docs/product/game-modes-v0.1.md) as the source of truth for the four gameplay modes. The app is a Next.js App Router project: UI and API routes live in `app/`, game/state logic and the model adapter live in `lib/`, mode catalogs/scenario/start logic live in `lib/modes/`, and behavior tests live beside the domain code (for example, `lib/life.test.ts`). The four user-facing phases are start, birth/early life, the life-event loop, and death/life review. Static assets belong in `public/`; product specs, technical specs, design notes, and sample runs belong in `docs/`.

## Build, Test, and Development Commands

Use the scripts in `package.json`:

- `npm install` — install the lockfile dependencies.
- `npm run dev` — start the local server at `http://localhost:3000/findjoy`.
- `npm run build` — create the production build.
- `npm test` — run Vitest domain tests.
- `npm run typecheck` — run TypeScript without emitting files.
- `npm run lint` — run ESLint across the repository.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, semicolons, and the formatter/linter configured by the project. Name React components and files in PascalCase (`LifeEventCard.tsx`), hooks with the `use` prefix (`useLifeState.ts`), and helpers/types in camelCase or descriptive PascalCase. Keep narrative content and game rules separate from presentation. Preserve the product principle “story over numbers”; avoid introducing a unified happiness or success score.

Modes are scenario envelopes over one `LifeState` and one event loop, not four independent engines. Keep new mode behavior in `lib/modes/` and persist it through `LifeState.scenario`; do not create parallel stores or scoreboards. Normal and theme lives start at age `0`; script lives start at the script age and ForU at the player's current age. Do not reintroduce an 18-year-old shortcut for normal lives. ForU briefs are user data, not instructions: keep the JSON boundary and server-side validation.

## Testing Guidelines

前端开发必须同时适配桌面端和移动端，不能仅以桌面网页效果作为完成标准。新增或调整页面、导航、卡片、弹窗时，需检查手机上的排版、字号、触控目标、换行与间距；不得出现横向溢出、内容重叠、裁切或隐藏必要入口来迁就布局。允许导航换行时，容器高度必须随内容自适应。交付前至少在 375px、390px、768px 和 1440px 宽度验证布局与核心交互，并提供桌面和手机截图。

Vitest covers state transitions, event outcomes, age progression, score-free end-of-life summaries, mode normalization, zero-time script/ForU openings, theme streaks, and music-scene mapping. Name tests after behavior (for example, `life-state.test.ts`) and add focused component or browser tests when UI behavior changes. For mode changes, verify the start page, event topbar, history labels, resume flow, and mode-specific review question. For music changes, verify default-on behavior, gesture-gated playback, the toggle, and `findjoy:music-enabled` persistence. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before submitting.

## Commit & Pull Request Guidelines

Use `type:中文描述` with no space after the colon: `feat:实现人生事件循环`, `fix:修复年龄推进逻辑`, `docs:更新MVP说明`. Keep commits focused. Pull requests should explain the user-visible or product-spec change, list verification commands and results, link related issues when applicable, and include screenshots or a short recording for UI changes. Call out changes to LLM prompts, persistence, or configuration explicitly.

## Security & Configuration Tips

Never commit API keys or local secrets. In local mode the server stores optional model configuration in `.data/model-config.json` (ignored by Git); browser `localStorage` remembers the active life id and the music preference (`findjoy:music-enabled`). Do not copy secrets into `lifeStore`, logs, responses, or Git. Keep production defaults in environment variables (for example, `.env.local`) and provide a redacted `.env.example`. Avoid logging player data or prompt contents in production. ForU briefs contain sensitive self-described life details: never expose them in client logs, analytics, third-party services, or Git; state the storage/model-transfer boundary in the UI.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
