export interface ProviderModel {
  id: string;
  label: string;
  inputCostPerMillion: number;
  outputCostPerMillion: number;
}

export interface ModelProvider {
  id: string;
  label: string;
  baseUrl: string;
  models: ProviderModel[];
}

// Prices are USD estimates per million tokens. Verify vendor billing before relying on them.
export const MODEL_PROVIDERS: ModelProvider[] = [
  { id: "volcengine-ark", label: "火山方舟", baseUrl: "https://ark.cn-beijing.volces.com/api/v3", models: [{ id: "doubao-seed-1-6-250615", label: "豆包 Seed 1.6", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "doubao-seed-1-6-lite-250615", label: "豆包 Seed 1.6 Lite", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "alibaba-bailian", label: "阿里云百炼", baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1", models: [{ id: "qwen3.8-max", label: "Qwen 3.8 Max", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "qwen3-max", label: "Qwen 3 Max", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "qwen-plus", label: "Qwen Plus", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "deepseek", label: "DeepSeek", baseUrl: "https://api.deepseek.com/v1", models: [{ id: "deepseek-chat", label: "DeepSeek Chat（最新非推理）", inputCostPerMillion: 0.28, outputCostPerMillion: 0.42 }, { id: "deepseek-reasoner", label: "DeepSeek Reasoner（最新推理）", inputCostPerMillion: 0.55, outputCostPerMillion: 2.19 }] },
  { id: "zhipu", label: "智谱 AI", baseUrl: "https://open.bigmodel.cn/api/paas/v4", models: [{ id: "glm-4-flash", label: "GLM-4-Flash", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "glm-4-plus", label: "GLM-4-Plus", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "moonshot", label: "月之暗面", baseUrl: "https://api.moonshot.cn/v1", models: [{ id: "moonshot-v1-8k", label: "Moonshot 8K", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "moonshot-v1-32k", label: "Moonshot 32K", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "minimax", label: "MiniMax", baseUrl: "https://api.minimax.chat/v1", models: [{ id: "MiniMax-Text-01", label: "MiniMax Text 01", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "MiniMax-M1", label: "MiniMax M1", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "tencent-hunyuan", label: "腾讯混元", baseUrl: "https://api.hunyuan.cloud.tencent.com/v1", models: [{ id: "hunyuan-turbos-latest", label: "混元 Turbo", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "hunyuan-large", label: "混元 Large", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "baichuan", label: "百川智能", baseUrl: "https://api.baichuan-ai.com/v1", models: [{ id: "Baichuan4", label: "Baichuan 4", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "Baichuan3-Turbo", label: "Baichuan 3 Turbo", inputCostPerMillion: 0, outputCostPerMillion: 0 }] },
  { id: "openai", label: "OpenAI", baseUrl: "https://api.openai.com/v1", models: [{ id: "gpt-4o-mini", label: "GPT-4o mini", inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 }, { id: "gpt-4.1-mini", label: "GPT-4.1 mini", inputCostPerMillion: 0.4, outputCostPerMillion: 1.6 }] },
  { id: "google-gemini", label: "Google Gemini", baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", models: [{ id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", inputCostPerMillion: 0.3, outputCostPerMillion: 2.5 }, { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", inputCostPerMillion: 1.25, outputCostPerMillion: 10 }] },
  { id: "openrouter", label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1", models: [{ id: "deepseek/deepseek-chat", label: "DeepSeek V3", inputCostPerMillion: 0, outputCostPerMillion: 0 }, { id: "openai/gpt-4o-mini", label: "GPT-4o mini", inputCostPerMillion: 0.15, outputCostPerMillion: 0.6 }] },
];

export function getProvider(providerId: string | undefined) {
  return MODEL_PROVIDERS.find((provider) => provider.id === providerId);
}

export function normalizeRemoteModels(value: unknown): Array<{ id: string; label: string }> {
  if (!value || typeof value !== "object") return [];
  const data = (value as { data?: unknown }).data;
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  return data.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const id = (item as { id?: unknown }).id;
    if (typeof id !== "string" || !id.trim() || seen.has(id)) return [];
    seen.add(id);
    return [{ id, label: id }];
  });
}

export function resolveProviderModel(providerId: string | undefined, modelId: string | undefined) {
  const provider = getProvider(providerId) ?? getProvider("openai");
  if (!provider) throw new Error("OpenAI provider catalog is unavailable");
  const model = provider.models.find((item) => item.id === modelId) ?? provider.models[0];
  return { providerId: provider.id, baseUrl: provider.baseUrl, model: model.id, inputCostPerMillion: model.inputCostPerMillion, outputCostPerMillion: model.outputCostPerMillion };
}
