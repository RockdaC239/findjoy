import { NextResponse } from "next/server";
import { applyNextEvent } from "../../../../../lib/life";
import { buildFallbackEvent, sanitizeModelConfig, streamNextEvent } from "../../../../../lib/model-adapter";
import { lifeStore } from "../../../../../lib/life-store";
import { encodeSseMessage } from "../../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = lifeStore.get(id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  if (state.dead) return NextResponse.json({ error: "人生已经结束", state }, { status: 409 });
  const body = await request.json().catch(() => ({}));
  const choice = body.choice;
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const preview = buildFallbackEvent(state, choice);
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在继续", preview: { story: preview.story, title: preview.event.title } })));
      try {
        const iterator = streamNextEvent(state, choice, sanitizeModelConfig(body.modelConfig));
        let item = await iterator.next();
        while (!item.done) {
          controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          item = await iterator.next();
        }
        const nextState = lifeStore.set(applyNextEvent(state, item.value, choice ?? { id: "none", text: "继续生活" }));
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state: nextState, event: item.value, ended: nextState.dead })));
      } catch {
        controller.enqueue(encoder.encode(encodeSseMessage("error", { error: "人生服务暂时不可用" })));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: streamHeaders });
}
