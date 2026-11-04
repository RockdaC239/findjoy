import { readDeveloperMode } from "../../../../../lib/developer-mode";
import { isDeveloper } from "../../../../../lib/developer";
import { streamMockLifeEvent } from "../../../../../lib/mock-life";
import { lifeGeneration } from "../../../../../lib/life-generation";
import { CommerceError } from "../../../../../lib/commerce-store";
import { currentUser, appOrigin } from "../../../../../lib/auth";
import { hasSameOrigin } from "../../../../../lib/auth-policy";
import { NextResponse } from "next/server";
import { applyNextEvent, resolveOfferedChoice, type LifeChoice } from "../../../../../lib/life";
import { buildTranscriptUserContent, sanitizeModelConfig, serializeTranscriptEvent, streamNextEvent, type TranscriptMessage } from "../../../../../lib/model-adapter";
import { lifeStore } from "../../../../../lib/life-store";
import { storyStream } from "../../../../../lib/story-stream";
import { acquireGeneration, releaseGeneration, commitGeneration } from "../../../../../lib/generation-capacity";
import { readJsonObject, withApiGuard } from "../../../../../lib/api-request";

const streamHeaders = { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" };

function parseChoice(value: unknown): LifeChoice | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "object" || Array.isArray(value)) return undefined;
  const { id, text } = value as Record<string, unknown>;
  if (typeof id !== "string" || !id || id.length > 128 || typeof text !== "string" || !text || text.length > 2000) return undefined;
  return { id, text };
}

export const POST = withApiGuard(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const developerMode = readDeveloperMode(request.headers.get("cookie"));
  const developer = developerMode.enabled && await isDeveloper(user);
  const mock = developerMode.mock;
  if (mock && !developer) return NextResponse.json({ error: "没有调试权限" }, { status: 403 });
  const { id } = await params;
  const state = await lifeStore.get(id, user.id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  const body = await readJsonObject(request);
  if (typeof body.expectedEventId !== "string") return NextResponse.json({error:"请恢复最新人生后继续"},{status:400});
  if (body.expectedEventId !== state.history.at(-1)?.id) return NextResponse.json({state,ended:state.dead});
  if (state.dead) return NextResponse.json({ error: "人生已经结束", state }, { status: 409 });
  const choice = parseChoice(body.choice);
  if (body.choice !== undefined && body.choice !== null && !choice) return NextResponse.json({error:"选项格式无效"},{status:400});
  const offered = state.history.at(-1)?.choices;
  if (offered?.length && (!choice || !offered.some(item => item.id === choice.id))) return NextResponse.json({error:"请选择当前事件提供的选项"},{status:400});
  let lease;
  let admission: string | undefined;
  let transcript: TranscriptMessage[] | null;
  try {
    admission=await acquireGeneration(user.id, Date.now(), { skipRateLimit: developer });
    lease=await lifeGeneration.begin(id,user.id);
    const latestState=await lifeStore.get(id,user.id);
    if(latestState?.history.at(-1)?.id!==body.expectedEventId){
      await lifeGeneration.release(lease);
      await releaseGeneration(admission);
      return NextResponse.json({state:latestState,ended:latestState?.dead});
    }
    transcript=await lifeStore.getTranscript(id);
  } catch(error) {
    if (lease) await lifeGeneration.release(lease).catch(() => {});
    if (admission) await releaseGeneration(admission);
    if(error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers:{"Retry-After":"5"}});
    return NextResponse.json({error:"服务暂时不可用，请稍后恢复进度"},{status:503});
  }
  // 规整为模型真正给出的选项文案（按 id 匹配待定节点），避免脚本/异常客户端发送的
  // 无关文本让模型以为"没有做决定"而复述上一事件；转录与请求使用同一份，缓存前缀一致。
  const choiceForModel = resolveOfferedChoice(choice, state.history.at(-1));
  // 旧存档没有转录行 → null，走旧式单条提示词（不建立转录）；新人生从开局起就有转录。
  const stream = storyStream(async (send) => {
    send("status", { message: "人生正在继续" });
    try {
      const iterator = mock && state.flags.developerMock === true ? streamMockLifeEvent(state, choiceForModel) : streamNextEvent(state, choiceForModel, sanitizeModelConfig(body.modelConfig), transcript);
      let item = await iterator.next();
      while (!item.done) {
        if (item.value.retry) {
          send("retry", item.value.reason ? { reason: item.value.reason } : {});
        } else if (item.value.text) {
          send("token", item.value);
        }
        item = await iterator.next();
      }
      // 选择可能为空（童年纯叙事节点）。applyNextEvent 会把真实选择挂到给出它的节点上，
      // 新节点以待定状态入列；不选择则不补齐任何 choiceText。
      const nextState = applyNextEvent(state, item.value, choiceForModel);
      if (!mock) nextState.flags.developerMock = false;
      if (transcript) {
        transcript.push({ role: "user", content: buildTranscriptUserContent(state, choiceForModel, false) });
        transcript.push({ role: "assistant", content: serializeTranscriptEvent({ ...item.value, narrative: nextState.history.at(-1)?.narrative }) });

      }
      await commitGeneration(admission!, () => lifeGeneration.save(lease,nextState,transcript));
      send("complete", { state: nextState, event: item.value, ended: nextState.dead });
    } catch {
      const message = "故事暂未生成，请稍后恢复最新人生。";
      send("error", { error: message });
    } finally {
      try { await lifeGeneration.release(lease); }
      catch { console.error("[generation] life lease release deferred to expiry"); }
      await releaseGeneration(admission!);
    }
  });
  return new Response(stream, { headers: streamHeaders });
});
