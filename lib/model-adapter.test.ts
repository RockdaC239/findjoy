import { describe, expect, it } from "vitest";
import { buildFallbackEvent, buildModelPrompt, generateEnding, normalizeEnding, normalizeGeneratedEvent, resolveModelConfig, sanitizeModelConfig } from "./model-adapter";
import { createStarterLife } from "./life";

describe("model configuration", () => {
  it("uses a supplied provider and model ahead of environment defaults", () => {
    expect(
      resolveModelConfig(
        {
          providerId: "deepseek",
          apiKey: "user-key",
          model: "deepseek-chat",
        },
        { LLM_API_KEY: "env-key", LLM_BASE_URL: "https://api.openai.com/v1", LLM_MODEL: "gpt-4o-mini" },
      ),
    ).toEqual({
      apiKey: "user-key",
      providerId: "deepseek",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      inputCostPerMillion: 0.28,
      outputCostPerMillion: 0.42,
    });
  });

  it("falls back to environment configuration when no browser configuration is supplied", () => {
    expect(resolveModelConfig(undefined, { LLM_API_KEY: "env-key", LLM_INPUT_COST_PER_MILLION: "1.2" })).toMatchObject({
      apiKey: "env-key",
      providerId: "environment",
      baseUrl: "https://api.openai.com/v1",
      model: "gpt-4o-mini",
      inputCostPerMillion: 1.2,
      outputCostPerMillion: 0,
    });
  });

  it("accepts only a catalog provider while allowing its live model IDs", () => {
    expect(sanitizeModelConfig({ providerId: "alibaba-bailian", model: "not-a-model", apiKey: "key" })).toEqual({
      providerId: "alibaba-bailian",
      model: "not-a-model",
      apiKey: "key",
    });
  });

  it("keeps the fallback when generated narration tries to introduce a name", () => {
    const fallback = buildFallbackEvent({ basic: { age: 12 } } as never);

    expect(fallback.story).not.toMatch(/姓名|名字|叫作/);
  });

  it("accepts generated camelCase fields and preserves original model narration", () => {
    const state = { lifeId: "life", basic: { age: 0 }, history: [] } as never;
    const result = normalizeGeneratedEvent({
      timePassed: 4,
      story: "你开始认识窗外的声音，也慢慢形成自己的回应。",
      event: { type: "family", title: "你熟悉了日常", importance: 0.7 },
      choices: [{ id: "A", text: "靠近新的事物" }, { id: "B", text: "留在熟悉的节奏里" }],
      objectiveChanges: {},
      memory: "你在最早的日常里感到安心。",
    }, state);

    expect(result.story).toContain("窗外的声音");
    expect(result.choices).toHaveLength(2);
    expect(result.event.title).toBe("你熟悉了日常");
  });

  it("includes the complete lived history and current choice in the next-event prompt", () => {
    const state = {
      lifeId: "life",
      basic: { age: 24 },
      history: [{ age: 18, title: "离开家" }, { age: 22, title: "第一次工作" }],
      majorMemories: ["你在离开家时感到不舍。"],
      psychology: { valueProfile: { 关系: 0.8 }, behaviorPatterns: ["会为重要关系停留"] },
    } as unknown as import("./life").LifeState;
    const prompt = JSON.parse(buildModelPrompt(state, { id: "A", text: "接受新的工作机会" })) as Record<string, unknown>;

    expect(prompt.life_state).toEqual(state);
    expect(prompt.recent_history).toEqual(state.history);
    expect(prompt.previous_events).toEqual(state.history);
    expect(prompt.important_memories).toEqual(state.majorMemories);
    expect(prompt.hidden_value_profile).toEqual(state.psychology.valueProfile);
    expect(prompt.current_choice).toEqual({ id: "A", text: "接受新的工作机会" });
    expect(prompt.event_context).toEqual({ current_choice: { id: "A", text: "接受新的工作机会" }, previous_event: state.history[1] });
  });

  it("returns a mechanical fallback ending without an API key", async () => {
    const state = createStarterLife({ age: 81 });
    state.career.occupation = "教师";
    const ending = await generateEnding(state, { providerId: "deepseek", apiKey: "", model: "deepseek-chat" });

    expect(ending.age).toBe(81);
    expect(ending).not.toHaveProperty("score");
    expect(ending.question).toContain("再活一次");
  });

  it("keeps the fallback when a generated ending introduces a name", () => {
    const state = createStarterLife({ age: 70 });
    const fallback = {
      age: 70,
      death: "自然离世",
      facts: { occupation: "教师", city: "深圳", events: 20 },
      highlights: [{ age: 30, title: "你换了城市" }],
      patterns: ["你按自己的节奏生活。"],
      question: "如果可以再活一次，你会做出不同的选择吗？",
    };
    const result = normalizeEnding({
      age: 70,
      death: "自然离世",
      facts: { occupation: "教师", city: "深圳", events: 20 },
      highlights: [{ age: 35, title: "你认识了一个名叫小明的朋友" }],
      patterns: ["从你的选择来看，你重视陪伴。"],
    }, state, fallback);

    expect(result).toEqual(fallback);
  });
});
