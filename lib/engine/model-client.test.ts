import { afterEach, expect, it, vi } from "vitest";
import { FIRST_TOKEN_TIMEOUT_MS, requestModel, streamModel, type ResolvedModelConfig } from "./model-client";

const config: ResolvedModelConfig = { providerId: "test", apiKey: "synthetic-key", model: "synthetic-model", baseUrl: "https://model.invalid/v1", inputCostPerMillion: 0, outputCostPerMillion: 0 };
const messages = [{ role: "user" as const, content: "synthetic request" }];
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reads fragmented provider frames and preserves token usage", async () => {
  const wire = 'data: {"choices":[{"delta":{"content":"故事"}}]}\n\ndata: {"usage":{"prompt_tokens":12}}\n\ndata: [DONE]\n\n';
  const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({
    start(controller) {
      for (const part of [wire.slice(0, 18), wire.slice(18, 50), wire.slice(50)]) controller.enqueue(new TextEncoder().encode(part));
      controller.close();
    },
  })));
  vi.stubGlobal("fetch", fetchMock);
  const chunks = [];
  for await (const chunk of streamModel(config, messages)) chunks.push(chunk);
  expect(chunks).toEqual([{ text: "故事" }, { usage: { prompt_tokens: 12 } }]);
  const body = JSON.parse(fetchMock.mock.calls[0][1].body);
  expect(body.messages).toEqual(messages);
  expect(body.stream).toBe(true);
  expect(body.model).toBe(config.model);
});

it("aborts a provider with no first token and clears both timers", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn((_url, options: RequestInit) => new Promise((_resolve, reject) => {
    options.signal!.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
  })));
  const pending = expect(streamModel(config, messages).next()).rejects.toThrow("超过 25 秒");
  await vi.advanceTimersByTimeAsync(FIRST_TOKEN_TIMEOUT_MS);
  await pending;
  expect(vi.getTimerCount()).toBe(0);
});

it("reads a non-streaming ending response without interpreting its event content", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ choices: [{ message: { content: '{"any":"wire format"}' } }] })));
  expect(await requestModel(config, messages)).toBe('{"any":"wire format"}');
});
