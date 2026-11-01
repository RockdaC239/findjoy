import { NextResponse } from "next/server";
import { appOrigin, cookieOptions, LOGIN_COOKIE } from "../../../../lib/auth";
import { authorizationRequest } from "../../../../lib/authing";
import { safeReturnTo } from "../../../../lib/auth-policy";
import { identityStore } from "../../../../lib/identity-store";

export async function GET(request: Request) {
  try {
    const { url, pending } = await authorizationRequest(safeReturnTo(new URL(request.url).searchParams.get("returnTo")));
    const token = identityStore.beginLogin(pending);
    const response = NextResponse.redirect(url);
    response.cookies.set(LOGIN_COOKIE, token, cookieOptions(600));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    if (!process.env.FINDJOY_APP_ORIGIN) return NextResponse.json({ error: "登录尚未配置" }, { status: 503 });
    return NextResponse.redirect(new URL("/findjoy/login?error=unavailable", appOrigin()));
  }
}
