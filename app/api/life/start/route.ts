import { applyNextEvent, createStarterLife } from "../../../../lib/life";
import { backgroundToFinance, backgroundToFlags, rollBackground } from "../../../../lib/background";
import { buildTranscriptUserContent, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../lib/model-adapter";
import { lifeStore } from "../../../../lib/life-store";
import { encodeSseMessage } from "../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  // 四维出身档案随机生成（家庭经济 × 家庭结构 × 开局事件 × 天赋，600 种组合），
  // 经济底色写入初始财务状态，档案写入 flags 并作为本局系统提示词的固定后缀。
  const background = rollBackground();
  const starter = createStarterLife(input);
  const state = lifeStore.set({
    ...starter,
    finance: { ...starter.finance, ...backgroundToFinance(background) },
    flags: backgroundToFlags(background),
  });
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
