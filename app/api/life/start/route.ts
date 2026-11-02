import { isLaunchModeAvailable } from "../../../../lib/modes/catalog";
import { SIGNUP_POINTS } from "../../../../lib/points";
import { createHash } from "node:crypto";
import { commerceStore, CommerceError } from "../../../../lib/commerce-store";
import { currentUser, appOrigin } from "../../../../lib/auth";
import { hasSameOrigin } from "../../../../lib/auth-policy";
import { NextResponse } from "next/server";
import { applyNextEvent } from "../../../../lib/life";
import { buildTranscriptUserContent, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../lib/model-adapter";
import { lifeStore } from "../../../../lib/life-store";
import { createStartLife, parseStartLifeRequest, resolveStartPlan } from "../../../../lib/modes/start";
import { encodeSseMessage } from "../../../../lib/sse";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export async function POST(request: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const input = await request.json().catch(() => ({}));
  if (!isLaunchModeAvailable(input?.mode ?? "normal")) {
    return NextResponse.json({ error: "当前仅开放普通模式，其他玩法敬请期待", code: "MODE_UNAVAILABLE" }, { status: 403 });
  }
  const parsed = parseStartLifeRequest(input);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // 普通/主题模式沿用随机出身档案与跨局防重；剧本/ForU 的情境由目录或玩家资料决定，
  // 不掷出身、也不让跨人生防重把主线拉走。
  const selection = parsed.selection;
  const usesBackground = selection.mode === "normal" || selection.mode === "theme";
  const recentAvoid = usesBackground ? await lifeStore.recentBackgroundAvoid(6, user.id) : undefined;
  const recentStorylines = selection.mode === "normal" ? await lifeStore.recentStorylines(6, 3, user.id) : [];
  const plan = resolveStartPlan(selection, { backgroundAvoid: recentAvoid });
  const key = request.headers.get("Idempotency-Key");
  if (!key || key.length > 128) return NextResponse.json({ error: "缺少有效请求标识" }, { status: 400 });
  const state = createStartLife(plan, parsed.gender, { recentStorylines });
  let operation;
  try {
    await commerceStore.grantTrial(user.id, Number(process.env.FINDJOY_TRIAL_CREDITS ?? SIGNUP_POINTS));
    operation = (await commerceStore.beginLife(user.id, key, createHash("sha256").update(JSON.stringify({gender: parsed.gender, selection})).digest("hex"), state));
  } catch (error) {
    if (error instanceof CommerceError) return NextResponse.json({error:error.message,code:error.code}, {status:error.status});
    return NextResponse.json({error:"暂时无法创建人生，请稍后重试"}, {status:503});
  }
  // 重放只查已有结果，不再调用模型；首个请求拥有生成权。
  if (operation.lifeId !== state.lifeId) {
    if (operation.status === "complete") return NextResponse.json({state:await lifeStore.get(operation.lifeId,user.id)});
    return NextResponse.json({error: operation.status === "failed" ? "上次开局未完成，次数已退回，请重新开始" : "人生正在生成，请稍后恢复", code:operation.status === "failed" ? "START_FAILED" : "START_PENDING", operationId:operation.id}, {status:409});
  }

  const transcript: TranscriptMessage[] = [];
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(encodeSseMessage("status", { message: "人生正在展开", operationId: operation.id })));
      let completed = false;
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
        const openedState = applyNextEvent(state, item.value, undefined, {
            rollDeath: false,
            allowZeroTime: plan.openingAtCurrentAge,
          });
        transcript.push({ role: "user", content: buildTranscriptUserContent(state, undefined, true) });
        transcript.push({ role: "assistant", content: serializeTranscriptEvent(item.value) });
        await commerceStore.completeLife(operation.id, user.id, openedState, transcript);
        completed = true;
        controller.enqueue(encoder.encode(encodeSseMessage("complete", { state: openedState, event: item.value })));
      } catch {
        if (completed) return;
        if (!completed) await commerceStore.failLife(operation.id,user.id);
        const message = "开局暂未完成，未消费积分。请稍后重试。";
        controller.enqueue(encoder.encode(encodeSseMessage("error", { error: message, code: "START_FAILED" })));
      } finally {
        try { controller.close(); } catch { /* 浏览器断开不改变已提交的消费结果。 */ }
      }
    },
  });
  return new Response(stream, { headers: streamHeaders });
}
