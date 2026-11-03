import { appOrigin, currentUser } from "../../../../lib/auth";
import { hasSameOrigin } from "../../../../lib/auth-policy";
import { withApiGuard } from "../../../../lib/api-request";
import { CommerceError } from "../../../../lib/commerce-store";
import { grantDeveloperCredits, isDeveloper } from "../../../../lib/developer";
import { takeRateLimit } from "../../../../lib/rate-limit";

export const POST = withApiGuard(async (request: Request) => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有调试权限" }, { status: 403 });
  if (!await takeRateLimit(user.id, "developer-grant", 5, 60000)) return Response.json({ error: "操作频繁，请稍后再试" }, { status: 429 });
  try {
    const balance = await grantDeveloperCredits(user.id, request.headers.get("Idempotency-Key") ?? "");
    return Response.json({ balance }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof CommerceError) return Response.json({ error: error.message }, { status: error.status });
    throw error;
  }
});
