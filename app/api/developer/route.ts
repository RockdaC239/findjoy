import { currentUser } from "../../../lib/auth";
import { withApiGuard } from "../../../lib/api-request";
import { isDeveloper } from "../../../lib/developer";

export const GET = withApiGuard(async () => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有调试权限" }, { status: 403 });
  return Response.json({ enabled: true }, { headers: { "Cache-Control": "no-store" } });
});
