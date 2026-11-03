import { NextResponse } from "next/server";
import { appOrigin, currentUser } from "../../../lib/auth";
import { hasSameOrigin } from "../../../lib/auth-policy";
import { readJsonObject, withApiGuard } from "../../../lib/api-request";
import { isDeveloper } from "../../../lib/developer";
import { DEVELOPER_MODE_COOKIE, MOCK_MODE_COOKIE, readDeveloperMode } from "../../../lib/developer-mode";

export const GET = withApiGuard(async (request?: Request) => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有调试权限" }, { status: 403 });
  return Response.json({ allowed: true, ...readDeveloperMode(request?.headers.get("cookie") ?? null) }, { headers: { "Cache-Control": "no-store" } });
});
export const POST = withApiGuard(async (request: Request) => {
  const user = await currentUser();
  if (!user) return Response.json({ error: "请先登录" }, { status: 401 });
  if (!hasSameOrigin(request, appOrigin())) return Response.json({ error: "请求来源无效" }, { status: 403 });
  if (!await isDeveloper(user)) return Response.json({ error: "没有调试权限" }, { status: 403 });
  const body = await readJsonObject(request, 1024);
  if (typeof body.enabled !== "boolean" || typeof body.mock !== "boolean") return Response.json({ error: "调试设置无效" }, { status: 400 });
  const settings = { enabled: body.enabled, mock: body.enabled && body.mock };
  const response = NextResponse.json(settings, { headers: { "Cache-Control": "no-store" } });
  const options = { httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax" as const, path: "/findjoy", maxAge: 86400 };
  response.cookies.set(DEVELOPER_MODE_COOKIE, settings.enabled ? "1" : "0", options);
  response.cookies.set(MOCK_MODE_COOKIE, settings.mock ? "1" : "0", options);
  return response;
});
