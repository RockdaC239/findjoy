import { lifeGeneration } from "../../../../../lib/life-generation";
import { CommerceError } from "../../../../../lib/commerce-store";
import { currentUser, appOrigin } from "../../../../../lib/auth";
import { hasSameOrigin } from "../../../../../lib/auth-policy";
import { NextResponse } from "next/server";
import { generateEnding, sanitizeModelConfig } from "../../../../../lib/model-adapter";
import { lifeStore } from "../../../../../lib/life-store";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const { id } = await params;
  const state = lifeStore.get(id, user.id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  if (!state.dead) return NextResponse.json({error:"人生尚未结束"},{status:409});
  const cached=lifeGeneration.getEnding(id,user.id);
  if(cached)return NextResponse.json({ending:cached});
  let lease;
  try{lease=lifeGeneration.begin(id,user.id);}catch(error){if(error instanceof CommerceError)return NextResponse.json({error:error.message},{status:error.status});throw error;}
  const body = await request.json().catch(() => ({}));
  try {
    const ending = await generateEnding(state, sanitizeModelConfig(body.modelConfig));
    lifeGeneration.saveEnding(lease,ending);
    return NextResponse.json({ ending });
  } catch {
    lifeGeneration.release(lease);
    const message = "人生回顾暂未生成，请稍后重试";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
