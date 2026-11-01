import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appOrigin, cookieOptions, SESSION_COOKIE } from "../../../../lib/auth";
import { hasSameOrigin } from "../../../../lib/auth-policy";
import { identityStore } from "../../../../lib/identity-store";

export async function POST(request: Request) {
  if (!hasSameOrigin(request, appOrigin())) return NextResponse.json({ error: "请求来源无效" }, { status: 403 });
  const jar = await cookies();
  identityStore.revokeSession(jar.get(SESSION_COOKIE)?.value ?? "");
  const response = NextResponse.redirect(new URL("/findjoy/login", appOrigin()), 303);
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(0));
  return response;
}
