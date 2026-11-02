import { lifeGeneration } from "../../../../../lib/life-generation";
import { CommerceError } from "../../../../../lib/commerce-store";
import { currentUser, appOrigin } from "../../../../../lib/auth";
import { hasSameOrigin } from "../../../../../lib/auth-policy";
import { NextResponse } from "next/server";
import { applyNextEvent, resolveOfferedChoice } from "../../../../../lib/life";
import { buildTranscriptUserContent, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../../lib/model-adapter";
import { lifeStore } from "../../../../../lib/life-store";
import { encodeSseMessage } from "../../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const { id } = await params;
  const state = await lifeStore.get(id, user.id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  if (typeof body.expectedEventId !== "string") return NextResponse.json({error:"请恢复最新人生后继续"},{status:400});
  if (body.expectedEventId !== state.history.at(-1)?.id) return NextResponse.json({state,ended:state.dead});
  if (state.dead) return NextResponse.json({ error: "人生已经结束", state }, { status: 409 });
  const offered = state.history.at(-1)?.choices;
  if (offered?.length && (!body.choice || !offered.some(choice => choice.id === body.choice.id))) return NextResponse.json({error:"请选择当前事件提供的选项"},{status:400});
  let lease;
  try { lease=(await lifeGeneration.begin(id,user.id)); }
  catch(error){ if(error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status});throw error; }
  const latestState=await lifeStore.get(id,user.id);
  if(latestState?.history.at(-1)?.id!==body.expectedEventId){
    await lifeGeneration.release(lease);
    return NextResponse.json({state:latestState,ended:latestState?.dead});
  }
  const choice = body.choice;
  // 规整为模型真正给出的选项文案（按 id 匹配待定节点），避免脚本/异常客户端发送的
  // 无关文本让模型以为"没有做决定"而复述上一事件；转录与请求使用同一份，缓存前缀一致。
  const choiceForModel = resolveOfferedChoice(choice, state.history.at(-1));
  // 旧存档没有转录行 → null，走旧式单条提示词（不建立转录）；新人生从开局起就有转录。
  const transcript: TranscriptMessage[] | null = await lifeStore.getTranscript(id);
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
        const nextState = applyNextEvent(state, item.value, choiceForModel);
        if (transcript) {
          transcript.push({ role: "user", content: buildTranscriptUserContent(state, choiceForModel, false) });
          transcript.push({ role: "assistant", content: serializeTranscriptEvent(item.value) });

        }
        await lifeGeneration.save(lease,nextState,transcript);
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state: nextState, event: item.value, ended: nextState.dead })));
      } catch {
        await lifeGeneration.release(lease);
        const message = "故事暂未生成，请稍后恢复最新人生。";
        controller.enqueue(encoder.encode(encodeSseMessage("error", { error: message })));
      } finally {
        await lifeGeneration.release(lease);
        try { controller.close(); } catch { /* 断流后通过存档恢复。 */ }
      }
    },
  });
  return new Response(stream, { headers: streamHeaders });
}
