import { describe, expect, it } from "vitest";
import { getModelConfigMode, maskModelConfig, readLocalModelConfig, writeLocalModelConfig, type StoredModelConfig } from "./model-config";

describe("model config storage", () => {
  it("uses local file mode during development and environment mode in production", () => {
    expect(getModelConfigMode({ NODE_ENV: "development" })).toBe("local");
    expect(getModelConfigMode({ NODE_ENV: "production" })).toBe("environment");
    expect(getModelConfigMode({ NODE_ENV: "production", FINDJOY_MODEL_CONFIG_MODE: "local" })).toBe("local");
  });

  it("writes and reads a validated local model config without exposing the key in the masked view", () => {
    const config: StoredModelConfig = { providerId: "deepseek", apiKey: "local-secret", model: "deepseek-chat" };
    const path = "/tmp/findjoy-model-config-test.json";
    writeLocalModelConfig(config, path);
    expect(readLocalModelConfig(path)).toEqual(config);
    expect(maskModelConfig(config)).toEqual({ providerId: "deepseek", model: "deepseek-chat", hasApiKey: true, apiKeyHint: "****cret" });
  });

  it("rejects an unsupported provider when saving", () => {
    expect(() => writeLocalModelConfig({ providerId: "unknown", apiKey: "key", model: "model" }, "/tmp/findjoy-model-config-test.json")).toThrow("不支持的供应商");
  });
});
