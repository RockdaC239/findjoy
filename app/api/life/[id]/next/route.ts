import { NextResponse } from "next/server";
import { applyNextEvent } from "../../../../../lib/life";
import { buildTranscriptUserContent, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../../lib/model-adapter";
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
  // 旧存档没有转录行 → null，走旧式单条提示词（不建立转录）；新人生从开局起就有转录。
  const transcript: TranscriptMessage[] | null = lifeStore.getTranscript(id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在继续" })));
      try {
        const iterator = streamNextEvent(state, choice, sanitizeModelConfig(body.modelConfig), transcript);
        let item = await iterator.next();
        while (!item.done) {
          if (item.value.retry) {
            controller.enqueue(encoder.encode(encodeSseMessage("retry", {})));
          } else if (item.value.text) {
            controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          }
          item = await iterator.next();
        }
        // 选择可能为空（童年纯叙事节点）。applyNextEvent 会把真实选择挂到给出它的节点上，
        // 新节点以待定状态入列；不选择则不补齐任何 choiceText。
        const nextState = lifeStore.set(applyNextEvent(state, item.value, choice));
        if (transcript) {
          transcript.push({ role: "user", content: buildTranscriptUserContent(state, choice, false) });
          transcript.push({ role: "assistant", content: serializeTranscriptEvent(item.value) });
          lifeStore.setTranscript(id, transcript);
        }
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state: nextState, event: item.value, ended: nextState.dead })));
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
