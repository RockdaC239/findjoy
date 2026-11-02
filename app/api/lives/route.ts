import { currentUser } from "../../../lib/auth";
import { NextResponse } from "next/server";
import { lifeStore } from "../../../lib/life-store";
import { withApiGuard } from "../../../lib/api-request";

export const GET = withApiGuard(async () => {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "请先登录", code: "UNAUTHENTICATED" }, { status: 401 });
  return NextResponse.json({ lives: await lifeStore.listSummaries(user.id) });
});
