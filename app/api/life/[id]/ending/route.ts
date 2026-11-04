import { readDeveloperMode } from "../../../../../lib/developer-mode";
import { isDeveloper } from "../../../../../lib/developer";
import { mockLifeEnding } from "../../../../../lib/mock-life";
import { acquireGeneration, releaseGeneration, commitGeneration } from "../../../../../lib/generation-capacity";
import { lifeGeneration } from "../../../../../lib/life-generation";
import { CommerceError } from "../../../../../lib/commerce-store";
import { currentUser, appOrigin } from "../../../../../lib/auth";
import { hasSameOrigin } from "../../../../../lib/auth-policy";
import { NextResponse } from "next/server";
import { generateEnding, sanitizeModelConfig, resolveModelConfig } from "../../../../../lib/model-adapter";
import { lifeStore } from "../../../../../lib/life-store";
import { readJsonObject, withApiGuard } from "../../../../../lib/api-request";

export const POST = withApiGuard(async (request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const mock = readDeveloperMode(request.headers.get("cookie")).mock;
  if (mock && !await isDeveloper(user)) return NextResponse.json({ error: "没有调试权限" }, { status: 403 });
  const { id } = await params;
  const state = await lifeStore.get(id, user.id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  if (!state.dead) return NextResponse.json({error:"人生尚未结束"},{status:409});
  const mockEnding = state.flags.developerMock === true;
  if (mockEnding && !await isDeveloper(user)) return NextResponse.json({ error: "没有调试权限" }, { status: 403 });
  const cached=await lifeGeneration.getEnding(id,user.id);
  if(cached)return NextResponse.json({ending:cached});
  const body = await readJsonObject(request);
  let lease;
  let admission: string | undefined;
  try { admission=await acquireGeneration(user.id); lease=await lifeGeneration.begin(id,user.id); }
  catch(error) {
    if(admission)await releaseGeneration(admission);
    if(error instanceof CommerceError)return NextResponse.json({error:error.message,code:error.code},{status:error.status,headers:{"Retry-After":"5"}});
    return NextResponse.json({error:"服务暂时不可用，请稍后重试"},{status:503});
  }
  try {
    const requestConfig = sanitizeModelConfig(body.modelConfig);
    const config = mockEnding ? undefined : resolveModelConfig(requestConfig);
    const totals = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, prompt_cache_hit_tokens: 0, prompt_cache_miss_tokens: 0 };
    const ending = mockEnding ? mockLifeEnding(state) : await generateEnding(state, requestConfig, raw => {
      for (const key of Object.keys(totals) as Array<keyof typeof totals>) {
        const value = raw[key];
        if (typeof value === "number" && Number.isFinite(value) && value >= 0) totals[key] += value;
      }
    });
    if (config) ending.usage = {
      promptTokens: totals.prompt_tokens,
      completionTokens: totals.completion_tokens,
      totalTokens: totals.total_tokens,
      promptCacheHitTokens: totals.prompt_cache_hit_tokens,
      promptCacheMissTokens: totals.prompt_cache_miss_tokens,
      estimatedCostUsd: (totals.prompt_tokens * config.inputCostPerMillion + totals.completion_tokens * config.outputCostPerMillion) / 1_000_000,
      provider: config.baseUrl,
      model: config.model,
    };
    await commitGeneration(admission!, () => lifeGeneration.saveEnding(lease,ending));
    return NextResponse.json({ ending });
  } catch {
    const message = "人生回顾暂未生成，请稍后重试";
    return NextResponse.json({ error: message }, { status: 502 });
  } finally {
    try { await lifeGeneration.release(lease); }
    catch { console.error("[generation] ending lease release deferred to expiry"); }
    await releaseGeneration(admission!);
  }
});
