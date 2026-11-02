import { takeRateLimit } from "../../../../lib/rate-limit";
import { NextResponse } from "next/server";
import { appOrigin, cookieOptions, LOGIN_COOKIE } from "../../../../lib/auth";
import { authorizationRequest } from "../../../../lib/authing";
import { safeReturnTo } from "../../../../lib/auth-policy";
import { identityStore } from "../../../../lib/identity-store";

export async function GET(request: Request) {
  if (!takeRateLimit(request.headers.get("x-real-ip") ?? "local", "login", 20, 600000)) return NextResponse.json({error:"登录请求过于频繁，请稍后重试"},{status:429});
  try {
    const { url, pending } = await authorizationRequest(safeReturnTo(new URL(request.url).searchParams.get("returnTo")));
    const token = await identityStore.beginLogin(pending);
    const response = NextResponse.redirect(url);
    response.cookies.set(LOGIN_COOKIE, token, cookieOptions(600));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    if (!process.env.FINDJOY_APP_ORIGIN) return NextResponse.json({ error: "登录尚未配置" }, { status: 503 });
    return NextResponse.redirect(new URL("/findjoy/login?error=unavailable", appOrigin()));
  }
}
