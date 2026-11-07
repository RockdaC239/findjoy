import { afterEach, expect, it, vi } from "vitest";
import { createStarterLife } from "../life";
import { ModelError } from "./errors";
import { generateNextEvent, generateEnding } from "./generate";
const mocks = vi.hoisted(() => ({ stream: vi.fn(), request: vi.fn() }));
vi.mock("./model-client", () => ({ MAX_MODEL_ATTEMPTS: 3, streamModel: mocks.stream, requestModel: mocks.request, resolveModelConfig: () => ({ apiKey: "synthetic", baseUrl: "https://synthetic.invalid", model: "synthetic", inputCostPerMillion: 1, outputCostPerMillion: 2 }) }));
afterEach(() => vi.resetAllMocks());
it("does not retry or fall back on permanent event and ending errors", async () => {
  mocks.stream.mockImplementation(async function* () { throw new ModelError("credentials invalid", false); });
  mocks.request.mockRejectedValue(new ModelError("credentials invalid", false));
  await expect(generateNextEvent(createStarterLife())).rejects.toThrow("credentials invalid");
  await expect(generateEnding(createStarterLife())).rejects.toThrow("credentials invalid");
  expect(mocks.stream).toHaveBeenCalledTimes(1);
  expect(mocks.request).toHaveBeenCalledTimes(1);
});
it("preserves usage from failed attempts in fallback cost", async () => {
  mocks.stream.mockImplementation(async function* () {
    yield { text: "{}" };
    yield { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
  });
  const result = await generateNextEvent(createStarterLife());
  expect(result.usage).toMatchObject({ promptTokens: 30, completionTokens: 15, totalTokens: 45 });
  expect(result.usage!.estimatedCostUsd).toBeCloseTo(0.00006);
});
it("never logs raw output or free-form diagnostic text in production", async () => {
  vi.stubEnv("NODE_ENV", "production");
  const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
  mocks.stream.mockImplementation(async function* () { yield { text: "private life detail" }; });
  await generateNextEvent(createStarterLife());
  expect(warn).toHaveBeenCalled();
  expect(JSON.stringify(warn.mock.calls)).not.toContain("private life detail");
  warn.mockRestore();
  vi.unstubAllEnvs();
});

it("clears unsupported personal reflection and public lines when no real evidence exists", async () => {
  const { applyEndingHardFacts } = await import("./generate");
  const state = createStarterLife();
  const { buildEnding } = await import("../life");
  const ending = { ...buildEnding(state), reflection: "你总是如此", shareLines: ["人人都懂你"], evidenceEventIds: ["invented"] };
  const result = applyEndingHardFacts(ending, state) as typeof ending;
  expect(result.reflection).toBeUndefined();
  expect(result.shareLines).toBeUndefined();
  expect(result.evidenceEventIds).toEqual([]);
});

it("includes failed contract usage in a later successful event", async () => {
  let attempt = 0;
  mocks.stream.mockImplementation(async function* () {
    attempt++;
    yield { text: attempt === 1 ? "{}" : JSON.stringify({ outcome: "death", deathCause: "natural", timePassed: 5, story: "你五岁，在梦中平静离开。", event: { type: "health", title: "最后一幕", importance: 0.8 }, choices: [], objectiveChanges: {} }) };
    yield { usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
  });
  const result = await generateNextEvent(createStarterLife());
  expect(result.outcome).toBe("death");
  expect(result.usage).toMatchObject({ promptTokens: 20, completionTokens: 10, totalTokens: 30 });
});

it("retries an unfinished last scene instead of appending a fabricated death", async () => {
  const state = { ...createStarterLife({ age: 76 }), experienceVersion: 3 as const, lifespan: 81 };
  state.career.occupation = "退休";
  state.history = [{ id: "last", age: 76, type: "health", title: "复查", story: "选择观察", importance: 0.7 }];
  let attempt = 0;
  mocks.stream.mockImplementation(async function* () {
    attempt++;
    yield { text: JSON.stringify({
      outcome: attempt === 1 ? "continue" : "death", deathCause: "disease", timePassed: attempt === 1 ? 1 : 5,
      narration: attempt === 1 ? "八十岁复查，医生让你再考虑。" : "你把余下的日子安排妥当，八十一岁在家人陪伴下离世。",
      story: attempt === 1 ? "下周是否手术？" : "",
      event: { type: "health", title: "最后的日子", importance: 0.9 },
      choices: attempt === 1 ? ["观察", "手术", "复查"].map((text, index) => ({ id: String(index), text, requiresFollowUp: false, commitments: [] })) : [],
      lifeChanges: [], timeline: { resultAge: 77, sceneAge: attempt === 1 ? 77 : 81 }, stateUpdate: {}, objectiveChanges: {},
    }) };
  });
  const event = await generateNextEvent(state);
  expect(attempt).toBe(2);
  expect(mocks.stream.mock.calls[1][1].at(-1).content).toContain("完整终幕");
  expect(mocks.stream.mock.calls[1][1].at(-2)).toMatchObject({ role: "assistant" });
  expect(mocks.stream.mock.calls[1][1].at(-2).content).toContain("下周是否手术");
  expect(event.outcome).toBe("death");
  expect(event.narration).toBe("你把余下的日子安排妥当，八十一岁在家人陪伴下离世。");
  expect(state.basic.age).toBe(76);
});
