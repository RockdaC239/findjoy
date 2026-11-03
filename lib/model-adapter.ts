// 兼容已有调用方；实现按职责放在 engine/，提示词请编辑 engine/prompts/*.md。
export * from "./engine/generate";
export * from "./engine/event-contract";
export * from "./engine/context";
export * from "./engine/fallback";
export { ModelError } from "./engine/errors";
export { buildSystemPrompt, CHILDHOOD_SYSTEM_PROMPT } from "./engine/prompts/assemble";
export type { SystemPromptOptions } from "./engine/prompts/assemble";
export * from "./engine/model-client";
export * from "./engine/phase";
