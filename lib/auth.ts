import { cookies } from "next/headers";
import { identityStore } from "./identity-store";

export const SESSION_COOKIE = "findjoy_session";
export const LOGIN_COOKIE = "findjoy_login";

export function appOrigin(): string {
  const value = process.env.FINDJOY_APP_ORIGIN;
  if (!value) throw new Error("尚未配置应用访问地址");
  const url = new URL(value);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
    throw new Error("应用地址必须使用 HTTPS");
  }
  return url.origin;
}

export function cookieOptions(maxAge: number) {
  return { httpOnly: true, secure: appOrigin().startsWith("https:"), sameSite: "lax" as const, path: "/findjoy", maxAge };
}

export async function currentUser() {
  const jar = await cookies();
  return identityStore.getSession(jar.get(SESSION_COOKIE)?.value ?? "");
}
