import { NextResponse } from "next/server";
import { applyNextEvent, resolveOfferedChoice } from "../../../../../lib/life";
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
  // 规整为模型真正给出的选项文案（按 id 匹配待定节点），避免脚本/异常客户端发送的
  // 无关文本让模型以为"没有做决定"而复述上一事件；转录与请求使用同一份，缓存前缀一致。
  const choiceForModel = resolveOfferedChoice(choice, state.history.at(-1));
  // 旧存档没有转录行 → null，走旧式单条提示词（不建立转录）；新人生从开局起就有转录。
  const transcript: TranscriptMessage[] | null = lifeStore.getTranscript(id);
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在继续" })));
      try {
        const iterator = streamNextEvent(state, choiceForModel, sanitizeModelConfig(body.modelConfig), transcript);
        let item = await iterator.next();
        while (!item.done) {
          if (item.value.retry) {
            controller.enqueue(encoder.encode(encodeSseMessage("retry", item.value.reason ? { reason: item.value.reason } : {})));
          } else if (item.value.text) {
            controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          }
          item = await iterator.next();
        }
        // 选择可能为空（童年纯叙事节点）。applyNextEvent 会把真实选择挂到给出它的节点上，
        // 新节点以待定状态入列；不选择则不补齐任何 choiceText。
        const nextState = lifeStore.set(applyNextEvent(state, item.value, choiceForModel));
        if (transcript) {
          transcript.push({ role: "user", content: buildTranscriptUserContent(state, choiceForModel, false) });
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
