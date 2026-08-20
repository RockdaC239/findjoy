import { describe, expect, it } from "vitest";
import { getProvider, normalizeRemoteModels, resolveProviderModel } from "./provider-catalog";

describe("provider catalog", () => {
  it("resolves Volcengine Ark without exposing an endpoint choice to the user", () => {
    expect(resolveProviderModel("volcengine-ark", "doubao-seed-1-6-250615")).toMatchObject({
      providerId: "volcengine-ark",
      baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
      model: "doubao-seed-1-6-250615",
    });
  });

  it("lists Alibaba Bailian as a selectable provider with Qwen models", () => {
    const provider = getProvider("alibaba-bailian");

    expect(provider?.models.map((model) => model.id)).toContain("qwen-plus");
  });

  it("normalizes a provider model-list response without trusting arbitrary fields", () => {
    expect(normalizeRemoteModels({ data: [{ id: "qwen3-max" }, { id: "", owned_by: "x" }, { id: "qwen3-max" }] })).toEqual([
      { id: "qwen3-max", label: "qwen3-max" },
    ]);
  });
});
