import { appOrigin, currentUser } from "../../../../lib/auth";
import { hasSameOrigin } from "../../../../lib/auth-policy";
import { readJsonObject, withApiGuard } from "../../../../lib/api-request";
import { CommerceError } from "../../../../lib/commerce-store";
import { grantCreditsToAll, grantCreditsToUser } from "../../../../lib/admin";
import { isDeveloper } from "../../../../lib/developer";
import { takeRateLimit } from "../../../../lib/rate-limit";

export const POST = withApiGuard(async (request: Request) => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有后台权限" }, { status: 403 });
  if (!await takeRateLimit(user.id, "admin-grant", 20, 60000)) return Response.json({ error: "操作频繁，请稍后再试" }, { status: 429 });
  try {
    const body = await readJsonObject(request, 4096);
    const amount = body.amount;
    if (typeof amount !== "number") return Response.json({ error: "积分数量无效" }, { status: 400 });
    const key = request.headers.get("Idempotency-Key") ?? "";
    if (body.scope === "all") {
      return Response.json(await grantCreditsToAll(amount, key), { headers: { "Cache-Control": "no-store" } });
    }
    if (body.scope !== "user") return Response.json({ error: "发放对象无效" }, { status: 400 });
    if (typeof body.userId !== "string") return Response.json({ error: "请选择要发放的用户" }, { status: 400 });
    return Response.json(await grantCreditsToUser(body.userId, amount, key), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CommerceError) return Response.json({ error: error.message, code: error.code }, { status: error.status });
    throw error;
  }
});
