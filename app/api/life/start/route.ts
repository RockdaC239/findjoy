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
import { storyStream } from "../../../../lib/story-stream";
import { acquireGeneration, releaseGeneration, commitGeneration } from "../../../../lib/generation-capacity";
import { readJsonObject, withApiGuard } from "../../../../lib/api-request";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

export const POST = withApiGuard(async (request: Request) => {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const input = await readJsonObject(request);
  if (!isLaunchModeAvailable(input.mode ?? "normal")) {
    return NextResponse.json({ error: "当前仅开放普通模式，其他玩法敬请期待", code: "MODE_UNAVAILABLE" }, { status: 403 });
  }
  const parsed = parseStartLifeRequest(input);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  // 普通/主题模式沿用随机出身档案与跨局防重；剧本/ForU 的情境由目录或玩家资料决定，
  // 不掷出身、也不让跨人生防重把主线拉走。
  const selection = parsed.selection;
  const key = request.headers.get("Idempotency-Key");
  if (!key || key.length > 128) return NextResponse.json({ error: "缺少有效请求标识" }, { status: 400 });
  let state;
  let plan;
  let operation;
  let admission: string | undefined;
  const requestHash=createHash("sha256").update(JSON.stringify({gender: parsed.gender, selection})).digest("hex");
  try {
    operation=await commerceStore.findOperation(user.id,key,requestHash);
    if (!operation) {
      admission=await acquireGeneration(user.id);
      const usesBackground=selection.mode === "normal" || selection.mode === "theme";
      const recentAvoid=usesBackground ? await lifeStore.recentBackgroundAvoid(6,user.id) : undefined;
      const recentStorylines=selection.mode === "normal" ? await lifeStore.recentStorylines(6,3,user.id) : [];
      plan=resolveStartPlan(selection,{backgroundAvoid:recentAvoid});
      state=createStartLife(plan,parsed.gender,{recentStorylines});
      await commerceStore.grantTrial(user.id, Number(process.env.FINDJOY_TRIAL_CREDITS ?? SIGNUP_POINTS));
      operation = await commerceStore.beginLife(user.id,key,requestHash,state);
    }
  } catch (error) {
    if (admission) await releaseGeneration(admission);
    if (error instanceof CommerceError) return NextResponse.json({error:error.message,code:error.code}, {status:error.status,headers:{"Retry-After":"5"}});
    return NextResponse.json({error:"暂时无法创建人生，请稍后重试"}, {status:503});
  }
  // 重放只查已有结果，不再调用模型；首个请求拥有生成权。
  if (!state || operation.lifeId !== state.lifeId) {
    if (admission) await releaseGeneration(admission);
    if (operation.status === "complete") return NextResponse.json({state:await lifeStore.get(operation.lifeId,user.id)});
    return NextResponse.json({error: operation.status === "failed" ? "上次开局未完成，次数已退回，请重新开始" : "人生正在生成，请稍后恢复", code:operation.status === "failed" ? "START_FAILED" : "START_PENDING", operationId:operation.id}, {status:409});
  }

  const generationState=state;
  const openingAtCurrentAge=plan!.openingAtCurrentAge;
  const transcript: TranscriptMessage[] = [];
  const stream = storyStream(async (send) => {
    send("status", { message: "人生正在展开", operationId: operation.id });
    let completed = false;
    try {
      const iterator = streamNextEvent(generationState, undefined, sanitizeModelConfig(input.modelConfig), transcript);
      let item = await iterator.next();
      while (!item.done) {
        if (item.value.retry) {
          send("retry", item.value.reason ? { reason: item.value.reason } : {});
        } else if (item.value.text) {
          send("token", item.value);
        }
        item = await iterator.next();
      }
      // 开局事件以“待定节点”写入 history（含完整选项/时间戳/usage），不丢开局；
      // 剧本/ForU 的第一幕发生在当前年龄，允许 timePassed=0，不凭空加一岁。
      const openedState = applyNextEvent(generationState, item.value, undefined, {
          allowZeroTime: openingAtCurrentAge,
        });
      transcript.push({ role: "user", content: buildTranscriptUserContent(generationState, undefined, true) });
      transcript.push({ role: "assistant", content: serializeTranscriptEvent(item.value) });
      await commitGeneration(admission!, () => commerceStore.completeLife(operation.id,user.id,openedState,transcript));
      completed = true;
      send("complete", { state: openedState, event: item.value });
    } catch {
      if (completed) return;
      try { await commerceStore.failLife(operation.id,user.id); }
      catch { console.error("[generation] opening recovery deferred to reconciliation"); }
      try {
        const recovered=await commerceStore.getOperation(operation.id,user.id);
        if (recovered?.status === "complete") {
          const saved=await lifeStore.get(recovered.lifeId,user.id);
          if (saved) { send("complete",{state:saved}); return; }
        }
        if (recovered?.status === "failed") {
          send("error",{error:"开局未完成，积分已退回，请重新开始。",code:"START_FAILED"});
          return;
        }
      } catch { /* 状态未确认时保留原请求键，不能把一次网络错误当作未扣费证明。 */ }
      send("error",{error:"开局状态暂未确认，请稍后恢复原进度，勿重复开局。",code:"START_UNCONFIRMED",operationId:operation.id});
    } finally {
      await releaseGeneration(admission!);
    }
  });
  return new Response(stream, { headers: streamHeaders });
});
