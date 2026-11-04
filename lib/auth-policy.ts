const BASE = "/findjoy";

export function safeReturnTo(value: string | null | undefined): string {
  if (!value || value.length > 1000 || /[\\\u0000-\u001f]/.test(value)) return BASE;
  try {
    const decoded = decodeURIComponent(value);
    if (/[\\\u0000-\u001f]/.test(decoded)) return BASE;
    const url = new URL(decoded, "https://local.invalid");
    if (url.origin !== "https://local.invalid" ||
      (url.pathname !== BASE && !url.pathname.startsWith(`${BASE}/`)) ||
      url.pathname.startsWith(`${BASE}/api/`)) return BASE;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return BASE; }
}

export function hasSameOrigin(request: Request, appOrigin: string): boolean {
  return request.headers.get("origin") === new URL(appOrigin).origin;
}

/**
 * next/navigation 的 redirect() 会自动补 basePath。
 * returnTo 里已经带了 /findjoy，直接传给 redirect 会变成 /findjoy/findjoy（404）。
 */
export function appPathWithoutBase(returnTo: string): string {
  if (returnTo === BASE) return "/";
  if (returnTo.startsWith(`${BASE}/`) || returnTo.startsWith(`${BASE}?`) || returnTo.startsWith(`${BASE}#`)) {
    return returnTo.slice(BASE.length);
  }
  return returnTo.startsWith("/") ? returnTo : `/${returnTo}`;
}
