import { NextResponse } from "next/server";
import { applyNextEvent } from "../../../../lib/life";
import { buildTranscriptUserContent, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../lib/model-adapter";
import { lifeStore } from "../../../../lib/life-store";
import { createStartLife, parseStartLifeRequest, resolveStartPlan } from "../../../../lib/modes/start";
import { encodeSseMessage } from "../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  const input = await request.json().catch(() => ({}));
  const parsed = parseStartLifeRequest(input);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // 普通/主题模式沿用随机出身档案与跨局防重；剧本/ForU 的情境由目录或玩家资料决定，
  // 不掷出身、也不让跨人生防重把主线拉走。
  const selection = parsed.selection;
  const usesBackground = selection.mode === "normal" || selection.mode === "theme";
  const recentAvoid = usesBackground ? lifeStore.recentBackgroundAvoid(6) : undefined;
  const recentStorylines = selection.mode === "normal" ? lifeStore.recentStorylines(6) : [];
  const plan = resolveStartPlan(selection, { backgroundAvoid: recentAvoid });
  const state = lifeStore.set(createStartLife(plan, parsed.gender, { recentStorylines }));

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
            controller.enqueue(encoder.encode(encodeSseMessage("retry", item.value.reason ? { reason: item.value.reason } : {})));
          } else if (item.value.text) {
            controller.enqueue(encoder.encode(encodeSseMessage("token", item.value)));
          }
          item = await iterator.next();
        }
        // 开局事件以“待定节点”写入 history（含完整选项/时间戳/usage），不丢开局；
        // 开局不参与死亡判定（rollDeath:false），避免开局即死。
        // 剧本/ForU 的第一幕发生在当前年龄，允许 timePassed=0，不凭空加一岁。
        const openedState = lifeStore.set(
          applyNextEvent(state, item.value, undefined, {
            rollDeath: false,
            allowZeroTime: plan.openingAtCurrentAge,
          }),
        );
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
