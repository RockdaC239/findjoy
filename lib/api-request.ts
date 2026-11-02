import { isDatabaseUnavailable } from "./database";

export class RequestBodyError extends Error {
  constructor(public status: 400 | 413, public code: "INVALID_BODY" | "BODY_TOO_LARGE", message: string) {
    super(message);
  }
}

const MAX_JSON_BYTES = 64 * 1024;

/**
 * 读取并限制 JSON 请求体。Content-Length 只用于提前拒绝，实际读取时再次累计，
 * 防止伪造或缺失长度头绕过限制。
 */
export async function readJsonBody(request: Request, limit = MAX_JSON_BYTES): Promise<unknown> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error("请求体限制配置无效");
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) {
    throw new RequestBodyError(413, "BODY_TOO_LARGE", "请求内容过大");
  }
  if (!request.body) return {};
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new RequestBodyError(413, "BODY_TOO_LARGE", "请求内容过大");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!total) return {};
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(join(chunks, total));
  } catch {
    throw new RequestBodyError(400, "INVALID_BODY", "请求格式无效");
  }
  if (!text.trim()) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestBodyError(400, "INVALID_BODY", "请求格式无效");
  }
}

export async function readJsonObject(request: Request, limit = MAX_JSON_BYTES): Promise<Record<string, unknown>> {
  const body = await readJsonBody(request, limit);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new RequestBodyError(400, "INVALID_BODY", "请求格式无效");
  }
  return body as Record<string, unknown>;
}

function join(chunks: Uint8Array[], total: number): Uint8Array {
  if (chunks.length === 1) return chunks[0];
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

export function apiErrorResponse(error: unknown): Response {
  const headers = { "Cache-Control": "no-store" };
  if (error instanceof RequestBodyError) {
    return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  }
  if (isDatabaseUnavailable(error)) {
    console.error("[api] database unavailable");
    return Response.json(
      { error: "服务暂时不可用，请稍后重试", code: "SERVICE_UNAVAILABLE" },
      { status: 503, headers: { ...headers, "Retry-After": "5" } },
    );
  }
  console.error("[api] unhandled route error");
  return Response.json({ error: "服务暂时不可用，请稍后重试", code: "INTERNAL_ERROR" }, { status: 500, headers });
}

type RouteHandler<Args extends unknown[]> = (...args: Args) => Promise<Response>;

/** 兜底未在路由内处理的异常，数据库故障返回可重试的 503，不向客户端输出异常正文。 */
export function withApiGuard<Args extends unknown[]>(handler: RouteHandler<Args>): RouteHandler<Args> {
  return async (...args: Args) => {
    try {
      return await handler(...args);
    } catch (error) {
      return apiErrorResponse(error);
    }
  };
}
