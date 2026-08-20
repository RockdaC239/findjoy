import { describe, expect, it } from "vitest";
import { buildFallbackEvent, buildModelPrompt, buildNextEventMessages, buildSystemPrompt, buildTranscriptUserContent, diagnoseEnding, diagnoseGeneratedEvent, generateEnding, ModelError, normalizeEnding, normalizeGeneratedEvent, parseGeneratedJson, resolveModelConfig, sanitizeModelConfig, serializeTranscriptEvent } from "./model-adapter";
import { backgroundToFlags, flagsToBackground, type LifeBackground } from "./background";
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

  it("keeps the preview event anonymous (used only as a loading placeholder)", () => {
    const fallback = buildFallbackEvent({ basic: { age: 12 } } as never);

    expect(fallback.story).not.toMatch(/姓名|名字|叫作/);
  });

  it("accepts generated camelCase fields and preserves original model narration", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 4,
      story: "你开始认识窗外的声音，也慢慢形成自己的回应。",
      event: { type: "family", title: "你熟悉了日常", importance: 0.7 },
      choices: [{ id: "A", text: "靠近新的事物" }, { id: "B", text: "留在熟悉的节奏里" }],
      objectiveChanges: {},
      memory: "你在最早的日常里感到安心。",
    });

    expect(result).not.toBeNull();
    expect(result!.story).toContain("窗外的声音");
    expect(result!.choices).toHaveLength(2);
    expect(result!.event.title).toBe("你熟悉了日常");
  });

  it("rejects generated narration that introduces a name (strict contract)", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 2,
      story: "你遇到了一个名叫小明的同学，他成为了你的朋友。",
      event: { type: "relationship", title: "新朋友", importance: 0.7 },
      choices: [{ id: "A", text: "走近" }, { id: "B", text: "保持距离" }],
    });

    expect(result).toBeNull();
  });

  it("rejects generated narration with too few choices (strict contract)", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 2,
      story: "你面前出现了一个选择。",
      event: { type: "career", title: "新的机会", importance: 0.7 },
      choices: [{ id: "A", text: "只有一个选择" }],
    });

    expect(result).toBeNull();
  });

  it("rejects generated narration missing a story (strict contract)", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 2,
      event: { type: "career", title: "新的机会", importance: 0.7 },
      choices: [{ id: "A", text: "接受" }, { id: "B", text: "拒绝" }],
    });

    expect(result).toBeNull();
  });

  it("does not mistake everyday verbs like 叫外卖 for a name", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 2,
      story: "你决定叫外卖，好好休息一晚。",
      event: { type: "health", title: "好好休息", importance: 0.5 },
      choices: [{ id: "A", text: "点一份清淡的" }, { id: "B", text: "自己下厨" }],
    });

    expect(result).not.toBeNull();
  });

  it("does not mistake self-introduction narration for a name", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 1,
      story: "轮到你时，你站起身，响亮地说出自己的名字后坐下了。",
      event: { type: "career", title: "小学第一课", importance: 0.6 },
      choices: [{ id: "A", text: "再介绍一遍" }, { id: "B", text: "安静坐下" }],
    });

    expect(result).not.toBeNull();
  });

  it("accepts a childhood event without choices (no-choice phase)", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 5,
      story: "五岁那年，父亲下了岗，家里一夜之间变得安静。",
      event: { type: "family", title: "父亲下岗", importance: 0.8 },
      objectiveChanges: { incomeYearly: 30000 },
      memory: "父亲下岗那年，你第一次感受到家里的安静。",
    }, false);

    expect(result).not.toBeNull();
    expect(result!.choices).toEqual([]);
  });

  it("rejects a childhood event that forgot its story", () => {
    const result = normalizeGeneratedEvent({
      timePassed: 5,
      event: { type: "family", title: "父亲下岗", importance: 0.8 },
    }, false);

    expect(result).toBeNull();
  });

  it("diagnoses the exact contract gate that failed", () => {
    expect(diagnoseGeneratedEvent({ timePassed: 2, event: { title: "x", type: "career" }, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }] })).toBe("story 缺失或为空");
    expect(diagnoseGeneratedEvent({ timePassed: 2, story: "s", event: { title: "", type: "career" }, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }] })).toBe("event.title 缺失或为空");
    expect(diagnoseGeneratedEvent({ timePassed: 2, story: "s", event: { title: "x", type: "xyz" }, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }] })).toContain("event.type 非法");
    expect(diagnoseGeneratedEvent({ timePassed: 2, story: "s", event: { title: "x", type: "career" }, choices: [{ id: "A", text: "a" }] })).toContain("choices 少于 2");
    expect(diagnoseGeneratedEvent({ timePassed: 2, story: "s", event: { title: "x", type: "career" }, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }] })).toBeNull();
  });

  it("maps Chinese or alias event types to the English enum instead of failing the contract", () => {
    const base = { timePassed: 2, story: "s", event: { title: "x", type: "事业" as string }, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }] };
    expect(diagnoseGeneratedEvent(base)).toBeNull();
    expect(normalizeGeneratedEvent(base)?.event.type).toBe("career");

    const cases: Array<[string, string]> = [
      ["职业", "career"], ["家庭", "family"], ["健康", "health"], ["身体", "health"],
      ["爱情", "relationship"], ["感情", "relationship"], ["财务", "finance"], ["经济", "finance"],
      ["其他", "random"], ["意外", "random"], ["Career", "career"], [" career ", "career"],
    ];
    for (const [alias, expected] of cases) {
      expect(normalizeGeneratedEvent({ ...base, event: { title: "x", type: alias } })?.event.type).toBe(expected);
    }
    // 完全未知的值仍然严格失败
    expect(diagnoseGeneratedEvent({ ...base, event: { title: "x", type: "命运之外" } })).toContain("event.type 非法");
  });

  it("accepts a choices object map as well as an array", () => {
    const normalized = normalizeGeneratedEvent({
      timePassed: 2,
      story: "s",
      event: { type: "career", title: "x" },
      choices: { A: "选择一", B: "选择二" },
    });
    expect(normalized?.choices).toEqual([{ id: "A", text: "选择一" }, { id: "B", text: "选择二" }]);
  });

  it("repairs fenced or padded JSON before parsing instead of retrying", () => {
    expect(parseGeneratedJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(parseGeneratedJson('前缀文字 {"a":1} 后缀文字')).toEqual({ a: 1 });
    expect(parseGeneratedJson('  {"a":1}  ')).toEqual({ a: 1 });
    expect(() => parseGeneratedJson("完全不是 JSON")).toThrow(ModelError);
  });

  it("diagnoses a well-formed ending as passing", () => {
    const value = {
      age: 70,
      death: "自然离世",
      facts: { occupation: "教师", city: "深圳", events: 20 },
      highlights: [{ age: 27, title: "你放弃了第一次创业机会" }, { age: 45, title: "你选择回到家人身边" }],
      patterns: ["从你的选择来看，你重视陪伴。"],
    };

    expect(diagnoseEnding(value)).toBeNull();
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

    expect(prompt.history).toEqual(state.history);
    expect(prompt.major_memories).toEqual(state.majorMemories);
    expect(prompt.personality).toEqual({
      value_profile: state.psychology.valueProfile,
      behavior_patterns: state.psychology.behaviorPatterns,
      internal_conflicts: state.psychology.internalConflicts,
    });
    expect((prompt.current_state as Record<string, unknown>).age).toBe(24);
    expect(prompt.current_choice).toEqual({ id: "A", text: "接受新的工作机会" });
  });

  it("keeps the prompt prefix byte-stable across turns so DeepSeek's prefix cache can hit", () => {
    const state = createStarterLife({ age: 20 });
    state.history = [{ id: "1", age: 20, type: "career", title: "第一份工作", story: "你进入职场。", importance: 0.7 }];
    const next = structuredClone(state);
    next.basic.age = 24;
    next.history.push({ id: "2", age: 24, type: "relationship", title: "遇见伴侣", story: "你认识了一个重要的人。", importance: 0.8 });

    const previous = buildModelPrompt(state);
    const current = buildModelPrompt(next, { id: "A", text: "接受新的工作机会" });
    // 上一轮 history 数组中最后一个共享事件（不含结束括号）之前的字节必须与新一轮完全一致：
    // 这保证 system 提示词 + 身份 + 性格 + 记忆 + 历史数组的公共前缀可以命中 DeepSeek 缓存。
    const sharedThroughHistory = previous.slice(0, previous.indexOf('],"current_state"'));
    expect(current.startsWith(sharedThroughHistory)).toBe(true);
    expect(sharedThroughHistory.length).toBeGreaterThan(200);
  });

  it("puts identity only in the first transcript user message", () => {
    const state = createStarterLife({ age: 20 });
    const first = JSON.parse(buildTranscriptUserContent(state, undefined, true)) as Record<string, unknown>;
    expect(first.life).toMatchObject({ id: state.lifeId, gender: state.basic.gender, city: state.basic.city });
    expect(first.personality).toMatchObject({ value_profile: state.psychology.valueProfile });
    expect(first.major_memories).toEqual(state.majorMemories);
    expect(first.current_choice).toBeNull();

    const lean = JSON.parse(buildTranscriptUserContent(state, { id: "A", text: "接受" }, false)) as Record<string, unknown>;
    expect(lean.life).toBeUndefined();
    expect(lean.personality).toBeUndefined();
    expect(lean.current_state).toMatchObject({ age: 20 });
    expect(lean.current_choice).toEqual({ id: "A", text: "接受" });
  });

  it("builds an append-only conversation so each request's prefix is the previous request's full input", () => {
    const system = "system-prompt";
    const start = createStarterLife({ age: 0 });
    const firstTurn = buildNextEventMessages(system, start, undefined, []);
    expect(firstTurn).toHaveLength(2);
    expect(firstTurn[0]).toEqual({ role: "system", content: system });

    // 第一轮完成：转录 = [user(身份+状态), assistant(事件)]
    const event1 = { timePassed: 6, story: "你开始认识这个世界。", event: { type: "family", title: "童年开始了", importance: 0.7 }, choices: [{ id: "A", text: "a" }, { id: "B", text: "b" }], objectiveChanges: {}, memory: "你最早的记忆。" };
    const transcript = [
      { role: "user" as const, content: firstTurn[1].content },
      { role: "assistant" as const, content: serializeTranscriptEvent(event1 as never) },
    ];

    const next = structuredClone(start);
    next.basic.age = 6;
    next.history.push({ ...event1, id: "e1", age: 6 } as never);

    // 第二轮请求 = [system, ...上一轮完整输入, user(本轮状态+选择)]
    const secondTurn = buildNextEventMessages(system, next, { id: "A", text: "a" }, transcript);
    expect(secondTurn.slice(0, -1)).toEqual([{ role: "system", content: system }, ...transcript]);
    expect(secondTurn.at(-1)).toEqual({ role: "user", content: buildTranscriptUserContent(next, { id: "A", text: "a" }) });
  });

  it("falls back to the legacy single-shot prompt when no transcript exists", () => {
    const state = createStarterLife({ age: 30 });
    const messages = buildNextEventMessages("system", state, undefined, null);
    expect(messages).toHaveLength(2);
    expect(JSON.parse(messages[1].content)).toMatchObject({ history: [] });
  });

  it("throws a clear error when no API key is configured", async () => {
    const state = createStarterLife({ age: 81 });
    state.career.occupation = "教师";

    await expect(generateEnding(state, { providerId: "deepseek", apiKey: "", model: "deepseek-chat" })).rejects.toThrow(ModelError);
  });

  it("rejects a generated ending that introduces a name (strict contract)", () => {
    const result = normalizeEnding({
      age: 70,
      death: "自然离世",
      facts: { occupation: "教师", city: "深圳", events: 20 },
      highlights: [{ age: 35, title: "你认识了一个名叫小明的朋友" }],
      patterns: ["从你的选择来看，你重视陪伴。"],
    });

    expect(result).toBeNull();
  });

  it("accepts a well-formed generated ending", () => {
    const result = normalizeEnding({
      age: 70,
      death: "自然离世",
      facts: { occupation: "教师", city: "深圳", events: 20 },
      highlights: [{ age: 27, title: "你放弃了第一次创业机会" }, { age: 45, title: "你选择回到家人身边" }],
      patterns: ["从你的选择来看，你常常会在真正重要的时刻为关系停下来。"],
    });

    expect(result).not.toBeNull();
    expect(result!.highlights).toHaveLength(2);
    expect(result!.patterns).toHaveLength(1);
  });
});

describe("life background system prompt", () => {
  it("returns the base prompt without a background profile", () => {
    expect(buildSystemPrompt(true)).toBe(buildSystemPrompt(true, undefined));
    expect(buildSystemPrompt(true)).toContain("开局第一个事件更要重要");
  });

  it("appends the fixed per-game background profile to the system prompt", () => {
    const background: LifeBackground = { economy: "小康", structure: "双亲完整", event: "机会降临", talent: "学业" };
    const prompt = buildSystemPrompt(true, background);
    expect(prompt).toContain("【本局出身档案】");
    expect(prompt).toContain("家庭经济：小康");
    expect(prompt).toContain("开局事件基调：机会降临");
    expect(prompt).toContain("机会如何落到你面前");
  });

  it("reads the per-game background from state flags", () => {
    const state = { ...createStarterLife(), flags: backgroundToFlags({ economy: "大富", structure: "收养", event: "家庭变故", talent: "无" }) };
    const prompt = buildSystemPrompt(false, flagsToBackground(state.flags));
    expect(prompt).toContain("家庭经济：大富");
    expect(prompt).toContain("家庭结构：收养");
  });
});
