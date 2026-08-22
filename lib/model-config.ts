import fs from "node:fs";
import path from "node:path";
import { getProvider } from "./provider-catalog";

export type ModelConfigMode = "local" | "environment";

export interface StoredModelConfig {
  providerId: string;
  apiKey: string;
  model: string;
}

export interface PublicModelConfig {
  providerId?: string;
  model?: string;
  hasApiKey: boolean;
  apiKeyHint?: string;
}

export const DEFAULT_MODEL_CONFIG_PATH = path.join(process.cwd(), ".data", "model-config.json");

export function getModelConfigMode(env: Record<string, string | undefined> = process.env): ModelConfigMode {
  if (env.FINDJOY_MODEL_CONFIG_MODE === "local") return "local";
  if (env.FINDJOY_MODEL_CONFIG_MODE === "environment") return "environment";
  return env.NODE_ENV === "production" ? "environment" : "local";
}

function validateModelConfig(value: unknown): StoredModelConfig {
  if (!value || typeof value !== "object") throw new Error("模型配置格式无效");
  const input = value as Record<string, unknown>;
  const providerId = typeof input.providerId === "string" ? input.providerId.trim() : "";
  const apiKey = typeof input.apiKey === "string" ? input.apiKey.trim() : "";
  const model = typeof input.model === "string" ? input.model.trim().slice(0, 200) : "";
  if (!getProvider(providerId)) throw new Error("不支持的供应商");
  if (!apiKey) throw new Error("请填写 API Key");
  if (!model) throw new Error("请填写模型");
  return { providerId, apiKey: apiKey.slice(0, 500), model };
}

export function readLocalModelConfig(filePath = DEFAULT_MODEL_CONFIG_PATH): StoredModelConfig | undefined {
  try {
    return validateModelConfig(JSON.parse(fs.readFileSync(filePath, "utf8")));
  } catch {
    return undefined;
  }
}

export function writeLocalModelConfig(value: unknown, filePath = DEFAULT_MODEL_CONFIG_PATH): StoredModelConfig {
  const config = validateModelConfig(value);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { encoding: "utf8", mode: 0o600 });
  try { fs.chmodSync(filePath, 0o600); } catch { /* best effort on platforms without chmod */ }
  return config;
}

export function maskModelConfig(config: StoredModelConfig | undefined): PublicModelConfig {
  if (!config) return { hasApiKey: false };
  return {
    providerId: config.providerId,
    model: config.model,
    hasApiKey: Boolean(config.apiKey),
    apiKeyHint: config.apiKey ? `****${config.apiKey.slice(-4)}` : undefined,
  };
}

export function getLocalModelConfigPath(env: Record<string, string | undefined> = process.env) {
  return env.FINDJOY_MODEL_CONFIG_PATH?.trim() || DEFAULT_MODEL_CONFIG_PATH;
}

export function resolveStoredModelConfig(env: Record<string, string | undefined> = process.env) {
  return getModelConfigMode(env) === "local" ? readLocalModelConfig(getLocalModelConfigPath(env)) : undefined;
}
