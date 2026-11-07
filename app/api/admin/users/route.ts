import { currentUser } from "../../../../lib/auth";
import { withApiGuard } from "../../../../lib/api-request";
import { searchUsers } from "../../../../lib/admin";
import { isDeveloper } from "../../../../lib/developer";

export const GET = withApiGuard(async (request: Request) => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有后台权限" }, { status: 403 });
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return Response.json({ users: await searchUsers(q) }, { headers: { "Cache-Control": "no-store" } });
});
