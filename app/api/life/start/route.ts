import { createStarterLife } from "../../../../lib/life";
import { buildFallbackEvent, createBirthBackground, sanitizeModelConfig, streamNextEvent } from "../../../../lib/model-adapter";
import { lifeStore } from "../../../../lib/life-store";
import { encodeSseMessage } from "../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const state = lifeStore.set(createStarterLife(input));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const preview = buildFallbackEvent(state);
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在展开", preview: { story: preview.story, title: preview.event.title } })));
      try {
        const iterator = streamNextEvent(state, undefined, sanitizeModelConfig(input.modelConfig));
        let item = await iterator.next();
        while (!item.done) {
          controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          item = await iterator.next();
        }
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state, event: item.value, background: createBirthBackground(state) })));
      } catch {
        controller.enqueue(encoder.encode(encodeSseMessage("error", { error: "人生服务暂时不可用" })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: streamHeaders });
}
