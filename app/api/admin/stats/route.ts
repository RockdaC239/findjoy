import { currentUser } from "../../../../lib/auth";
import { withApiGuard } from "../../../../lib/api-request";
import { adminStats } from "../../../../lib/admin";
import { isDeveloper } from "../../../../lib/developer";

export const GET = withApiGuard(async () => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有后台权限" }, { status: 403 });
  return Response.json(await adminStats(), { headers: { "Cache-Control": "no-store" } });
});
