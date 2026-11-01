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
