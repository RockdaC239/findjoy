import { createStarterLife } from "../../../../lib/life";
import { createBirthBackground, sanitizeModelConfig, streamNextEvent } from "../../../../lib/model-adapter";
import { lifeStore } from "../../../../lib/life-store";
import { encodeSseMessage } from "../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const state = lifeStore.set(createStarterLife(input));
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在展开", preview: { background: createBirthBackground(state), city: state.basic.city } })));
      try {
        const iterator = streamNextEvent(state, undefined, sanitizeModelConfig(input.modelConfig));
        let item = await iterator.next();
        while (!item.done) {
          if (item.value.retry) {
            controller.enqueue(encoder.encode(encodeSseMessage("retry", {})));
          } else if (item.value.text) {
            controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          }
          item = await iterator.next();
        }
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state, event: item.value, background: createBirthBackground(state) })));
      } catch (error) {
        const message = error instanceof Error ? error.message : "人生服务暂时不可用";
        controller.enqueue(encoder.encode(encodeSseMessage("error", { error: message })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: streamHeaders });
}
