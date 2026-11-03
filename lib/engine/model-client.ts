import { getProvider, resolveProviderModel } from "../provider-catalog";
import { getModelConfigMode, resolveStoredModelConfig } from "../model-config";
import type { NextEventMessage } from "./context";
import { ModelError } from "./errors";

export const MODEL_REQUEST_TIMEOUT_MS = 60_000;
export const MAX_MODEL_ATTEMPTS = 3;
// 首 token 看门狗：超过该时长模型还没开始输出，判定为卡住，快速失败重试（不等满 60 秒）。
export const FIRST_TOKEN_TIMEOUT_MS = 25_000;

export interface ModelConfig {
  providerId: string;
  apiKey: string;
  model: string;
}

export interface ResolvedModelConfig extends ModelConfig {
  baseUrl: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

type EnvConfig = Record<string, string | undefined>;

function finiteOrZero(value: unknown) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}

export function resolveModelConfig(config?: Partial<ModelConfig>, env: EnvConfig = process.env): ResolvedModelConfig {
  const configuredMode = getModelConfigMode(env);
  const storedConfig = configuredMode === "local" ? resolveStoredModelConfig(env) : undefined;
  const hasEnvironmentConfig = Boolean((env.LLM_API_KEY || env.OPENAI_API_KEY || env.LLM_MODEL || env.OPENAI_MODEL)?.trim());
  const mode = configuredMode === "local" && !storedConfig && hasEnvironmentConfig && !env.FINDJOY_MODEL_CONFIG_MODE ? "environment" : configuredMode;
  const activeConfig = storedConfig ?? (mode === "local" && !hasEnvironmentConfig ? config : undefined);
  const providerModel = activeConfig?.providerId ? resolveProviderModel(activeConfig.providerId, activeConfig.model) : undefined;
  const requestedModel = typeof activeConfig?.model === "string" && activeConfig.model.trim() ? activeConfig.model.trim() : undefined;
  const pricingModel = mode === "local" ? providerModel : (config?.providerId ? resolveProviderModel(config.providerId, config.model) : undefined);
  const pricingRequestedModel = mode === "local" ? requestedModel : (typeof config?.model === "string" && config.model.trim() ? config.model.trim() : undefined);
  const fixedModel = (env.LLM_MODEL || env.OPENAI_MODEL || "").trim();
  return {
    apiKey: mode === "local" ? (activeConfig?.apiKey || env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim() : (env.LLM_API_KEY || env.OPENAI_API_KEY || "").trim(),
    providerId: mode === "local" && providerModel ? providerModel.providerId : "environment",
    baseUrl: mode === "local" && providerModel ? providerModel.baseUrl : (env.LLM_BASE_URL || env.OPENAI_BASE_URL || "https://api.openai.com/v1").trim().replace(/\/$/, ""),
    model: mode === "environment" ? fixedModel || "gpt-4o-mini" : requestedModel || providerModel?.model || fixedModel || "gpt-4o-mini",
    inputCostPerMillion: pricingModel && pricingRequestedModel === pricingModel.model ? pricingModel.inputCostPerMillion : (pricingModel ? 0 : finiteOrZero(env.LLM_INPUT_COST_PER_MILLION)),
    outputCostPerMillion: pricingModel && pricingRequestedModel === pricingModel.model ? pricingModel.outputCostPerMillion : (pricingModel ? 0 : finiteOrZero(env.LLM_OUTPUT_COST_PER_MILLION)),
  };
}

export function sanitizeModelConfig(value: unknown): Partial<ModelConfig> | undefined {
  if (!value || typeof value !== "object") return undefined;
  const input = value as Record<string, unknown>;
  const provider = typeof input.providerId === "string" ? getProvider(input.providerId) : undefined;
  const model = provider && typeof input.model === "string" && input.model.trim() ? input.model.trim().slice(0, 200) : provider?.models[0].id;
  return {
    providerId: provider?.id,
    apiKey: typeof input.apiKey === "string" ? input.apiKey.slice(0, 500) : undefined,
    model,
  };
}

// 只处理供应商协议，不解释人生事件或选择。
export async function* streamModel(config: ResolvedModelConfig, messages: NextEventMessage[]): AsyncGenerator<{ text?: string; usage?: Record<string, unknown> }> {
  const { apiKey, baseUrl, model } = config;
  let firstTokenSeen = false;
  const controller = new AbortController();
  // 首 token 看门狗：25 秒没开始输出就中断本轮，快速进入重试（避免干等 60 秒）
  const watchdog = setTimeout(() => { if (!firstTokenSeen) controller.abort(); }, FIRST_TOKEN_TIMEOUT_MS);
  const overall = setTimeout(() => controller.abort(), MODEL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` }, signal: controller.signal, body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 4096, stream: true, stream_options: { include_usage: true }, response_format: { type: "json_object" }, messages }) });
    if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`, response.status < 400 || response.status >= 500 || [408, 429].includes(response.status));
    if (!response.body) throw new ModelError("模型服务未返回内容");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true });
      const blocks = buffer.split(/\r?\n\r?\n/);
      buffer = blocks.pop() ?? "";
      if (done && buffer.trim()) { blocks.push(buffer); buffer = ""; }
      for (const block of blocks) {
        const data = block.split("\n").filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trim()).join("");
        if (!data || data === "[DONE]") continue;
        try {
          const packet = JSON.parse(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
            usage?: Record<string, unknown>;
          };
          const content = packet.choices?.[0]?.delta?.content;
          if (typeof content === "string") {
            firstTokenSeen = true;
            yield { text: content };
          }
          if (packet.usage && typeof packet.usage === "object") yield { usage: packet.usage };
        } catch { /* Ignore malformed keepalive frames. */ }
      }
      if (done) break;
    }
    reader.releaseLock();
  } catch (error) {
    if (controller.signal.aborted) throw new ModelError(firstTokenSeen
      ? "模型响应超时（超过 60 秒），请稍后重试或更换模型"
      : "模型迟迟未开始输出（超过 25 秒），正在重试");
    throw error;
  } finally {
    clearTimeout(watchdog);
    clearTimeout(overall);
  }
}

export async function requestModel(config: ResolvedModelConfig, messages: NextEventMessage[], onUsage?: (usage: Record<string, unknown>) => void): Promise<string> {
  const { apiKey, baseUrl, model } = config;
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(MODEL_REQUEST_TIMEOUT_MS),
    body: JSON.stringify({ model, thinking: { type: "disabled" }, temperature: 0.6, max_tokens: 2048, response_format: { type: "json_object" }, messages }),
  });
  if (!response.ok) throw new ModelError(`模型服务返回错误（HTTP ${response.status}），请检查 Key 权限或供应商状态`, response.status < 400 || response.status >= 500 || [408, 429].includes(response.status));
  const payload = (await response.json()) as { usage?: Record<string, unknown>; choices?: Array<{ message?: { content?: string } }> };
  if (payload.usage && typeof payload.usage === "object") onUsage?.(payload.usage);
  return payload.choices?.[0]?.message?.content ?? "";
}
