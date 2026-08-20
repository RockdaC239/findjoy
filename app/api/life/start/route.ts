import { applyNextEvent, createStarterLife } from "../../../../lib/life";
import { buildTranscriptUserContent, OPENING_GENRES, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../lib/model-adapter";
import { lifeStore } from "../../../../lib/life-store";
import { encodeSseMessage } from "../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  // 开局基调随机轮换（安稳日常/机会降临/家庭变故/平静起点），写入 flags 后本局固定，
  // 系统提示词据此生成开局，避免"变故型开局"成为默认。
  const openingGenre = OPENING_GENRES[Math.floor(Math.random() * OPENING_GENRES.length)];
  const state = lifeStore.set({ ...createStarterLife(input), flags: { openingGenre } });
  const transcript: TranscriptMessage[] = [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在展开" })));
      try {
        const iterator = streamNextEvent(state, undefined, sanitizeModelConfig(input.modelConfig), transcript);
        let item = await iterator.next();
        while (!item.done) {
          if (item.value.retry) {
            controller.enqueue(encoder.encode(encodeSseMessage("retry", {})));
          } else if (item.value.text) {
            controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          }
          item = await iterator.next();
        }
        // 开局事件以“待定节点”写入 history（含完整选项/时间戳/usage），不丢开局；
        // 开局不参与死亡判定（rollDeath:false），避免开局即死。
        const openedState = lifeStore.set(applyNextEvent(state, item.value, undefined, { rollDeath: false }));
        transcript.push({ role: "user", content: buildTranscriptUserContent(state, undefined, true) });
        transcript.push({ role: "assistant", content: serializeTranscriptEvent(item.value) });
        lifeStore.setTranscript(state.lifeId, transcript);
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state: openedState, event: item.value })));
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
