# Repository Guidelines

## Project Structure & Module Organization

Treat [`人生模拟器 MVP 产品开发文档 v0.1.md`](./人生模拟器%20MVP 产品开发文档%20v0.1.md) as the product source of truth. The app is a Next.js App Router project: UI and API routes live in `app/`, game/state logic and the model adapter live in `lib/`, and behavior tests live beside the domain code (for example, `lib/life.test.ts`). The four user-facing phases are start, birth/early life, the life-event loop, and death/life review. Static assets belong in `public/`.

## Build, Test, and Development Commands

Use the scripts in `package.json`:

- `npm install` — install the lockfile dependencies.
- `npm run dev` — start the local server at `http://localhost:3000`.
- `npm run build` — create the production build.
- `npm test` — run Vitest domain tests.
- `npm run typecheck` — run TypeScript without emitting files.
- `npm run lint` — run ESLint across the repository.

## Coding Style & Naming Conventions

Use TypeScript, two-space indentation, semicolons, and the formatter/linter configured by the project. Name React components and files in PascalCase (`LifeEventCard.tsx`), hooks with the `use` prefix (`useLifeState.ts`), and helpers/types in camelCase or descriptive PascalCase. Keep narrative content and game rules separate from presentation. Preserve the product principle “story over numbers”; avoid introducing a unified happiness or success score. New lives start at age `0`; do not reintroduce an 18-year-old shortcut.

## Testing Guidelines

Vitest covers state transitions, event outcomes, age progression, and score-free end-of-life summaries. Name tests after behavior (for example, `life-state.test.ts`) and add focused component or browser tests when UI behavior changes. Run `npm test`, `npm run typecheck`, `npm run lint`, and `npm run build` before submitting.

## Commit & Pull Request Guidelines

Use `type:中文描述` with no space after the colon: `feat:实现人生事件循环`, `fix:修复年龄推进逻辑`, `docs:更新MVP说明`. Keep commits focused. Pull requests should explain the user-visible or product-spec change, list verification commands and results, link related issues when applicable, and include screenshots or a short recording for UI changes. Call out changes to LLM prompts, persistence, or configuration explicitly.

## Security & Configuration Tips

Never commit API keys or local secrets. The UI stores optional model configuration in browser `localStorage` and sends it per request; do not copy it into `lifeStore`, logs, or Git. Keep server defaults in environment variables (for example, `.env.local`) and provide a redacted `.env.example`. Avoid logging player data or prompt contents in production.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
