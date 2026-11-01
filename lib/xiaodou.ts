import { createHash, randomBytes, randomUUID, sign, verify } from "node:crypto";
import { readFileSync } from "node:fs";

const hash = (body: string | Uint8Array) => createHash("sha256").update(body).digest("hex");
const contentType = (value: string) => value.split(";", 1)[0].trim().toLowerCase();
const encode = (value: string) => encodeURIComponent(value).replace(/[!'()*]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);

interface SigningInput {
  method: string; url: URL; timestamp: string; nonce: string; appId: string;
  keyId: string; requestId: string; contentType: string; body: string;
}

export function requestSigningString(input: SigningInput): string {
  const path = decodeURIComponent(input.url.pathname);
  if (path.includes("..") || path.includes("//") || /[\\\u0000-\u001f]/.test(path)) throw new Error("支付路径无效");
  const query = [...input.url.searchParams.entries()].map(([key, value]) => [encode(key), encode(value)])
    .sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, value]) => `${key}=${value}`).join("&");
  return ["XD-Signature-v1", input.method.toUpperCase(), path, query, input.timestamp,
    input.nonce, input.appId, input.keyId, input.requestId, contentType(input.contentType), hash(input.body)].join("\n");
}

export function responseSigningString(status: number, type: string, requestId: string, timestamp: string, nonce: string, keyId: string, body: Uint8Array): string {
  return ["XD-Response-v1", status, contentType(type), requestId, timestamp, nonce, keyId, hash(body)].join("\n");
}

export function webhookSigningString(headers: Headers, body: Uint8Array): string {
  return ["XD-Webhook-v1", ...["Event-Id", "Event-Type", "Timestamp", "Nonce", "Key-Id"]
    .map(name => headers.get(`X-XD-Webhook-${name}`) ?? ""), hash(body)].join("\n");
}

export function verifyPlatformSignature(canonical: string, signature: string, keyId: string, timestamp: string, keys: Record<string, string>, now = Date.now()): boolean {
  if (!/^\d+$/.test(timestamp) || Math.abs(now / 1000 - Number(timestamp)) > 600 || !keys[keyId]) return false;
  try { return verify("RSA-SHA256", Buffer.from(canonical), keys[keyId], Buffer.from(signature, "base64")); }
  catch { return false; }
}

export function xiaodouConfig() {
  const base = new URL(process.env.XIAODOU_BASE_URL ?? "");
  if (base.protocol !== "https:" || base.pathname !== "/" || base.search || base.hash) throw new Error("支付接入地址无效");
  const appId = process.env.XIAODOU_APP_ID;
  const keyId = process.env.XIAODOU_KEY_ID;
  const privateKeyFile = process.env.XIAODOU_PRIVATE_KEY_FILE;
  const publicKeysFile = process.env.XIAODOU_PLATFORM_KEYS_FILE;
  if (!appId || !keyId || !privateKeyFile || !publicKeysFile) throw new Error("支付配置尚未完成");
  const keys = JSON.parse(readFileSync(publicKeysFile, "utf8")) as Record<string, string>;
  return { base, appId, keyId, privateKey: readFileSync(privateKeyFile, "utf8"), keys };
}

export class XiaodouError extends Error {
  constructor(public code: string, public requestId: string, public status: number) {
    super("支付服务暂未确认，请稍后查询订单");
  }
}

export async function xiaodouRequest(method: "GET" | "POST", path: string, body = "", requestId: string = randomUUID()): Promise<Record<string, unknown>> {
  const config = xiaodouConfig();
  const url = new URL(path, config.base);
  if (url.origin !== config.base.origin || !path.startsWith("/api/open/v1/")) throw new Error("支付路径无效");
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString("hex");
  const type = method === "POST" ? "application/json" : "";
  const canonical = requestSigningString({method, url, timestamp, nonce, appId:config.appId, keyId:config.keyId, requestId, contentType:type, body});
  const headers = new Headers({
    "X-XD-App-Id":config.appId, "X-XD-Timestamp":timestamp, "X-XD-Nonce":nonce,
    "X-XD-Key-Id":config.keyId, "X-XD-Request-Id":requestId,
    "X-XD-Sign":sign("RSA-SHA256", Buffer.from(canonical), config.privateKey).toString("base64"),
  });
  if (type) headers.set("Content-Type", type);
  const response = await fetch(url, {method, headers, ...(method === "POST" ? {body:body || undefined} : {}), signal:AbortSignal.timeout(15_000), cache:"no-store", redirect:"error"});
  const raw = new Uint8Array(await response.arrayBuffer());
  if (raw.byteLength > 1024 * 1024) throw new Error("支付响应过大");
  const rh = response.headers;
  const responseRequestId = rh.get("X-XD-Request-Id") ?? "";
  const sig = rh.get("X-XD-Response-Sign") ?? "";
  const kid = rh.get("X-XD-Response-Key-Id") ?? "";
  const ts = rh.get("X-XD-Response-Timestamp") ?? "";
  const rn = rh.get("X-XD-Response-Nonce") ?? "";
  if (sig && kid && ts && rn) {
    if (responseRequestId !== requestId || !verifyPlatformSignature(
      responseSigningString(response.status, rh.get("content-type") ?? "", responseRequestId, ts, rn, kid, raw), sig, kid, ts, config.keys,
    )) throw new Error("支付响应验证失败");
  } else if (response.ok) {
    throw new Error("支付成功响应缺少签名");
  }
  const result: unknown = JSON.parse(Buffer.from(raw).toString("utf8"));
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error("支付响应格式错误");
  const data = result as Record<string, unknown>;
  if (!response.ok) throw new XiaodouError(typeof data.code === "string" ? data.code : "UNKNOWN", requestId, response.status);
  if (data.requestId !== requestId) throw new Error("支付请求标识不匹配");
  return data;
}
