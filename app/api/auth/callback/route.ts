import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { appOrigin, cookieOptions, LOGIN_COOKIE, SESSION_COOKIE } from "../../../../lib/auth";
import { authenticateCallback } from "../../../../lib/authing";
import { safeReturnTo } from "../../../../lib/auth-policy";
import { identityStore } from "../../../../lib/identity-store";

export async function GET(request: Request) {
  const jar = await cookies();
  const pending = identityStore.consumeLogin(jar.get(LOGIN_COOKIE)?.value ?? "");
  try {
    if (!pending) throw new Error("登录已过期");
    const identity = await authenticateCallback(request, pending);
    const user = identityStore.resolveUser(identity.issuer, identity.subject, identity.displayName);
    const previous = jar.get(SESSION_COOKIE)?.value;
    if (previous) identityStore.revokeSession(previous);
    const session = identityStore.createSession(user.id);
    const response = NextResponse.redirect(new URL(safeReturnTo(pending.returnTo), appOrigin()));
    response.cookies.set(SESSION_COOKIE, session.token, cookieOptions(30 * 24 * 60 * 60));
    response.cookies.set(LOGIN_COOKIE, "", cookieOptions(0));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch {
    const response = NextResponse.redirect(new URL("/findjoy/login?error=callback", appOrigin()));
    response.cookies.set(LOGIN_COOKIE, "", cookieOptions(0));
    return response;
  }
}
