import { currentUser } from "../../../../lib/auth";
import { NextResponse } from "next/server";
import { lifeStore } from "../../../../lib/life-store";
import { withApiGuard } from "../../../../lib/api-request";

export const GET = withApiGuard(async (_request: Request, { params }: { params: Promise<{ id: string }> }) => {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  const { id } = await params;
  const state = await lifeStore.get(id, user.id);
  if (!state) return NextResponse.json({ error: "人生不存在" }, { status: 404 });
  return NextResponse.json({ state });
});
